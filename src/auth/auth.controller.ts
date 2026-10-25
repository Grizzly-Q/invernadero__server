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

/**
 * Autenticación de usuarios humanos mediante JWT Bearer, sin cookies ni credenciales de ESP32.
 * register y login son públicos; me y logout exigen una sesión vigente, sin restricción de rol.
 * Las cuentas y sesiones se persisten en PostgreSQL.
 * La validación de los cuerpos rechaza campos adicionales y formatos inválidos con HTTP 400.
 */
@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  /**
   * POST /auth/register: registra un usuario humano con rol OPERATOR y abre una sesión.
   * Es público y admite hasta cinco solicitudes por minuto e IP según el limitador configurado.
   * No crea un Usuario PostgreSQL ni asignaciones a invernaderos.
   * @param dto Cuerpo con name (2 a 80 caracteres), email válido (hasta 254) y password (8 a 128).
   * Se recortan los espacios del nombre y correo; el correo se normaliza a minúsculas.
   * La contraseña se conserva exactamente como se recibe; no se admite un campo role.
   * @returns HTTP 201 con accessToken, tokenType=Bearer, expiresIn en segundos y user
   * (id UUID, name, email, role=OPERATOR), sin contraseña ni hash. Respuesta no almacenable en caché.
   * @throws BadRequestException (400) si el cuerpo incumple la validación.
   * @throws ConflictException (409) si el correo normalizado ya está registrado.
   * @throws ThrottlerException (429) si se supera el límite de solicitudes.
   */
  @Public()
  @Post('register')
  @Header('Cache-Control', 'no-store')
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  register(@Body() dto: RegisterDto): Promise<TokenResponse> {
    return this.auth.register(dto);
  }

  /**
   * POST /auth/login: valida las credenciales de un usuario humano y abre una nueva sesión.
   * Es público y admite hasta cinco solicitudes por minuto e IP según el limitador configurado.
   * No cierra otras sesiones del mismo usuario ni emite un token de renovación.
   * @param dto Cuerpo con email válido de hasta 254 caracteres y password de 8 a 128 caracteres.
   * El correo se recorta y normaliza a minúsculas; la contraseña no se transforma.
   * @returns HTTP 200 con accessToken, tokenType=Bearer, expiresIn en segundos y perfil user
   * (id, name, email y role), sin contraseña ni hash. Respuesta no almacenable en caché.
   * @throws BadRequestException (400) si el cuerpo incumple la validación.
   * @throws UnauthorizedException (401) con mensaje uniforme si el correo o contraseña son incorrectos.
   * @throws ThrottlerException (429) si se supera el límite de solicitudes.
   */
  @Public()
  @Post('login')
  @HttpCode(HttpStatus.OK)
  @Header('Cache-Control', 'no-store')
  @Throttle({ default: { limit: 5, ttl: 60000 } })
  login(@Body() dto: LoginDto): Promise<TokenResponse> {
    return this.auth.login(dto);
  }

  /**
   * GET /auth/me: consulta el perfil de la sesión humana autenticada mediante JWT Bearer.
   * @param user Perfil incorporado por el guard; no se recibe desde el cuerpo ni la consulta.
   * @returns HTTP 200 con id, name, email y role, sin secretos ni datos de otros usuarios.
   * La respuesta incluye Cache-Control: no-store y no modifica la sesión.
   * @throws UnauthorizedException (401) si falta el JWT, venció o su sesión fue revocada.
   */
  @Get('me')
  @Header('Cache-Control', 'no-store')
  me(@CurrentUser() user: PublicUser): PublicUser {
    return user;
  }

  /**
   * POST /auth/logout: cierra únicamente la sesión identificada por el JWT Bearer actual.
   * Las otras sesiones del mismo usuario permanecen vigentes.
   * @param request Petición con sessionId verificado por el guard; no recibe parámetros de negocio.
   * @returns HTTP 204 sin cuerpo, después de retirar la sesión de PostgreSQL.
   * @throws UnauthorizedException (401) si el JWT o la sesión ya no son válidos;
   * repetir la petición con el mismo JWT revocado produce 401.
   */
  @Post('logout')
  @HttpCode(HttpStatus.NO_CONTENT)
  async logout(@Req() request: AuthenticatedRequest): Promise<void> {
    await this.auth.logout(request.sessionId);
  }
}
