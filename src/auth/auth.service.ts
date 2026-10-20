import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { randomUUID } from 'node:crypto';
import { UsersService } from '../users/users.service';
import type { PublicUser } from '../users/user.types';
import type { AuthConfig } from '../config/auth.config';
import type { AccessClaims, TokenResponse } from './auth.types';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { PasswordService } from './password.service';

/** Sesión temporal que permite revocar el JWT al cerrar sesión. */
interface Session {
  id: string;
  userId: string;
  expiresAt: number;
}

/** Emite un único JWT por sesión y permite revocarlo mediante logout. */
@Injectable()
export class AuthService {
  private readonly sessions = new Map<string, Session>();
  private readonly options: AuthConfig;

  constructor(
    private readonly users: UsersService,
    private readonly passwords: PasswordService,
    private readonly jwt: JwtService,
    config: ConfigService,
  ) {
    this.options = config.getOrThrow<AuthConfig>('auth');
  }

  /** Registra un usuario USER y devuelve una nueva sesión; rechaza correos repetidos. */
  async register(dto: RegisterDto): Promise<TokenResponse> {
    const user = await this.users.create(dto.name, dto.email, dto.password);
    return this.createSession(user);
  }

  /** Valida credenciales y abre una sesión; devuelve 401 con un mensaje uniforme. */
  async login(dto: LoginDto): Promise<TokenResponse> {
    const user = this.users.findByEmail(dto.email);
    const valid = await this.passwords.verify(dto.password, user?.passwordHash);
    if (!user || !valid) {
      throw new UnauthorizedException('Credenciales incorrectas.');
    }
    return this.createSession(this.users.findById(user.id)!);
  }

  /** Verifica firma y claims, y exige que la sesión y el usuario sigan vigentes. */
  async authenticate(
    token: string,
  ): Promise<{ user: PublicUser; sessionId: string }> {
    try {
      const claims = await this.jwt.verifyAsync<AccessClaims & { exp: number }>(
        token,
        {
          algorithms: ['HS256'],
          issuer: this.options.issuer,
          audience: this.options.audience,
        },
      );
      if (
        claims.type !== 'access' ||
        typeof claims.sub !== 'string' ||
        typeof claims.sid !== 'string' ||
        !Number.isFinite(claims.exp)
      ) {
        throw new Error('Claims inválidos.');
      }
      const session = this.sessions.get(claims.sid);
      const user = this.users.findById(claims.sub);
      if (
        !session ||
        session.userId !== claims.sub ||
        session.expiresAt <= Date.now() ||
        !user
      ) {
        throw new Error('Sesión inválida.');
      }
      // El rol se lee del servidor para no confiar en privilegios enviados por el cliente.
      return { user, sessionId: session.id };
    } catch {
      throw new UnauthorizedException('Token de acceso inválido o vencido.');
    }
  }

  /** Revoca inmediatamente el JWT de la sesión actual. */
  logout(sessionId: string): void {
    this.sessions.delete(sessionId);
  }

  private createSession(user: PublicUser): TokenResponse {
    this.pruneExpired();
    return this.issueToken(user, randomUUID());
  }

  private issueToken(user: PublicUser, sessionId: string): TokenResponse {
    const accessToken = this.jwt.sign(
      { sub: user.id, sid: sessionId, type: 'access' } satisfies AccessClaims,
      { expiresIn: this.options.accessTtl },
    );
    this.sessions.set(sessionId, {
      id: sessionId,
      userId: user.id,
      expiresAt: Date.now() + this.options.accessTtl * 1000,
    });
    return {
      accessToken,
      tokenType: 'Bearer',
      expiresIn: this.options.accessTtl,
      user,
    };
  }

  private pruneExpired(): void {
    for (const [id, session] of this.sessions) {
      if (session.expiresAt <= Date.now()) this.sessions.delete(id);
    }
  }
}
