import {
  Body,
  Controller,
  Get,
  Header,
  HttpCode,
  HttpStatus,
  Post,
  Req,
} from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import type { PublicUser } from '../users/user.types';
import { AuthService } from './auth.service';
import type { AuthenticatedRequest, TokenResponse } from './auth.types';
import { CurrentUser } from './decorators/current-user.decorator';
import { Public } from './decorators/public.decorator';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';

/** API JSON de autenticación para clientes móviles, sin cookies de sesión. */
@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  /** Crea un usuario normal y entrega un JWT; no acepta roles del cliente. */
  @Public()
  @Post('register')
  @Header('Cache-Control', 'no-store')
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  register(@Body() dto: RegisterDto): Promise<TokenResponse> {
    return this.auth.register(dto);
  }

  /** Abre una sesión con correo y contraseña; credenciales incorrectas dan 401. */
  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @Header('Cache-Control', 'no-store')
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  login(@Body() dto: LoginDto): Promise<TokenResponse> {
    return this.auth.login(dto);
  }

  /** Entrega el perfil correspondiente a la sesión autenticada. */
  @Get('me')
  @Header('Cache-Control', 'no-store')
  me(@CurrentUser() user: PublicUser): PublicUser {
    return user;
  }

  /** Revoca únicamente la sesión actual; responde 204 sin cuerpo. */
  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  logout(@Req() request: AuthenticatedRequest): void {
    this.auth.logout(request.sessionId);
  }
}
