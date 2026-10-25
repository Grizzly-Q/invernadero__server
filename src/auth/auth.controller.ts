import {
  Body,
  Controller,
  ForbiddenException,
  Get,
  Header,
  HttpCode,
  Post,
  Req,
  Res,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Throttle } from '@nestjs/throttler';
import type { Request, Response, CookieOptions } from 'express';
import type { AuthConfig } from '../config/auth.config';
import type { PublicUser } from '../users/user.types';
import { AuthService, type SessionTokens } from './auth.service';
import type { TokenResponse } from './auth.types';
import { CurrentUser } from './decorators/current-user.decorator';
import { Public } from './decorators/public.decorator';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';

/** Acceso Bearer en JSON y renovación mediante cookie HttpOnly; nunca expone el refresh a React. */
@Controller('auth')
export class AuthController {
  private readonly options: AuthConfig;
  private readonly cookieName = 'refresh_token';
  constructor(
    private readonly auth: AuthService,
    config: ConfigService,
  ) {
    this.options = config.getOrThrow<AuthConfig>('auth');
  }

  /** Registra una cuenta, crea sesión y establece cookie; rechaza campos extra mediante el pipe global. */
  @Public()
  @Post('register')
  @Header('Cache-Control', 'no-store')
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  async register(
    @Body() dto: RegisterDto,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<TokenResponse> {
    this.checkOrigin(request);
    return this.deliver(await this.auth.register(dto), response);
  }

  /** Valida credenciales, devuelve acceso corto y establece el refresh sin cerrar otras sesiones. */
  @Public()
  @Post('login')
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  async login(
    @Body() dto: LoginDto,
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<TokenResponse> {
    this.checkOrigin(request);
    return this.deliver(await this.auth.login(dto), response);
  }

  /**
   * Renueva acceso y cookie usando únicamente el refresh; no exige un acceso todavía vigente.
   * @throws ForbiddenException si el origen no está autorizado; UnauthorizedException si falta o falla la cookie.
   */
  @Public()
  @Post('refresh')
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  @Throttle({ default: { limit: 20, ttl: 60000 } })
  async refresh(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<TokenResponse> {
    this.checkOrigin(request, true);
    try {
      return this.deliver(
        await this.auth.refresh(this.cookie(request)),
        response,
      );
    } catch (error) {
      if (error instanceof UnauthorizedException)
        response.clearCookie(this.cookieName, this.cookieOptions());
      throw error;
    }
  }

  /** Consulta el perfil verificado por el guard; no modifica la sesión. */
  @Get('me')
  @Header('Cache-Control', 'no-store')
  me(@CurrentUser() user: PublicUser): PublicUser {
    return user;
  }

  /** Revoca la sesión y borra la cookie; acepta refresh con origen verificado o Bearer para clientes existentes. */
  @Public()
  @Post('logout')
  @HttpCode(204)
  @Header('Cache-Control', 'no-store')
  async logout(
    @Req() request: Request,
    @Res({ passthrough: true }) response: Response,
  ): Promise<void> {
    this.checkOrigin(request);
    try {
      if (request.headers.authorization) {
        const match = /^Bearer ([^\s]+)$/i.exec(request.headers.authorization);
        if (!match) throw new UnauthorizedException('Bearer inválido.');
        const session = await this.auth.authenticate(match[1]);
        await this.auth.logout(session.sessionId);
      } else {
        this.checkOrigin(request, true);
        await this.auth.logoutWithRefresh(this.cookie(request));
      }
    } finally {
      response.clearCookie(this.cookieName, this.cookieOptions());
    }
  }

  /** Rechaza solicitudes de otros sitios incluso si no pueden leer la respuesta CORS. */
  private checkOrigin(request: Request, required = false): void {
    const origin = request.headers.origin;
    if (
      (!origin && required) ||
      (origin && !this.options.webOrigins.includes(origin))
    )
      throw new ForbiddenException('Origen no autorizado.');
  }

  /** Lee una sola cookie JWT con límite de tamaño; rechaza cookies ambiguas o faltantes. */
  private cookie(request: Request): string {
    const values = (request.headers.cookie ?? '')
      .split(';')
      .map((part) => part.trim())
      .filter((part) => part.startsWith(this.cookieName + '='));
    if (values.length !== 1)
      throw new UnauthorizedException('Se requiere la cookie de renovación.');
    const token = values[0].slice(this.cookieName.length + 1);
    if (!/^[A-Za-z0-9_.-]{1,2048}$/.test(token))
      throw new UnauthorizedException('Cookie de renovación inválida.');
    return token;
  }

  /** Restringe la cookie a rutas de autenticación y al servidor que la emitió, sin Domain compartido. */
  private cookieOptions(): CookieOptions {
    return {
      httpOnly: true,
      secure: this.options.cookieSecure,
      sameSite: this.options.cookieSameSite,
      path: '/auth',
    };
  }

  /** Establece el secreto solo en Set-Cookie y conserva el contrato JSON público anterior. */
  private deliver(tokens: SessionTokens, response: Response): TokenResponse {
    const { refreshToken, refreshExpiresAt, ...result } = tokens;
    response.cookie(this.cookieName, refreshToken, {
      ...this.cookieOptions(),
      expires: refreshExpiresAt,
    });
    return result;
  }
}
