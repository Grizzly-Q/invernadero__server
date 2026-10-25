import type { Request } from 'express';
import type { PublicUser } from '../users/user.types';

/** Claims privados del JWT de acceso; JwtService añade iat, exp, iss y aud. */
export interface AccessClaims {
  sub: string;
  sid: string;
  type: 'access';
}

/** Contexto de una petición que ya superó el guard de autenticación. */
export interface AuthenticatedRequest extends Request {
  user: PublicUser;
  sessionId: string;
}

/** Respuesta pública con el JWT de acceso; el refresh web viaja solo como cookie. Duración en segundos. */
export interface TokenResponse {
  accessToken: string;
  tokenType: 'Bearer';
  expiresIn: number;
  user: PublicUser;
}
