import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService, type JwtVerifyOptions } from '@nestjs/jwt';
import { createHash, randomUUID } from 'node:crypto';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { UsersService } from '../users/users.service';
import type { PublicUser } from '../users/user.types';
import type { AuthConfig } from '../config/auth.config';
import type { AccessClaims, TokenResponse } from './auth.types';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { PasswordService } from './password.service';
import { UserSessionEntity } from './entities/user-session.entity';

/** Resultado interno: el refresh solo se entrega al navegador mediante una cookie HttpOnly. */
export interface SessionTokens extends TokenResponse {
  refreshToken: string;
  refreshExpiresAt: Date;
}
interface RefreshClaims {
  sub: string;
  sid: string;
  type: 'refresh';
  jti: string;
  exp: number;
}

/** Emite accesos cortos y rota refresh tokens de uso único dentro de una sesión persistente. */
@Injectable()
export class AuthService {
  private readonly options: AuthConfig;
  constructor(
    private readonly users: UsersService,
    private readonly passwords: PasswordService,
    private readonly jwt: JwtService,
    config: ConfigService,
    @InjectRepository(UserSessionEntity)
    private readonly sessions: Repository<UserSessionEntity>,
  ) {
    this.options = config.getOrThrow<AuthConfig>('auth');
  }

  /** Registra una cuenta y abre una sesión; propaga errores de validación y correo duplicado. */
  async register(dto: RegisterDto): Promise<SessionTokens> {
    return this.createSession(
      await this.users.create(dto.name, dto.email, dto.password),
    );
  }

  /** Verifica credenciales y exige un perfil vigente antes de abrir la sesión. */
  async login(dto: LoginDto): Promise<SessionTokens> {
    const user = await this.users.findByEmail(dto.email);
    const valid = await this.passwords.verify(dto.password, user?.passwordHash);

    if (!user || !valid) {
      throw new UnauthorizedException('Credenciales incorrectas.');
    }

    const profile = await this.users.findById(user.id);
    if (!profile) {
      throw new UnauthorizedException('Credenciales incorrectas.');
    }

    return this.createSession(profile);
  }

  /** Valida firma, tipo y sesión persistente; consulta la cuenta persistente vigente; los permisos se verifican aparte por invernadero. */
  async authenticate(
    token: string,
  ): Promise<{ user: PublicUser; sessionId: string }> {
    try {
      const claims = await this.jwt.verifyAsync<AccessClaims & { exp: number }>(
        token,
        this.verifyOptions(),
      );
      if (
        claims.type !== 'access' ||
        typeof claims.sub !== 'string' ||
        typeof claims.sid !== 'string' ||
        !Number.isFinite(claims.exp)
      )
        throw new Error('Claims inválidos.');
      const session = await this.sessions.findOneBy({
        id: claims.sid,
        userId: claims.sub,
      });
      const user = await this.users.findById(claims.sub);
      if (
        !session ||
        session.revokedAt ||
        session.expiresAt.getTime() <= Date.now() ||
        !user
      )
        throw new Error('Sesión inválida.');
      return { user, sessionId: session.id };
    } catch {
      throw new UnauthorizedException('Token de acceso inválido o vencido.');
    }
  }

  /**
   * Canjea un refresh firmado y vigente una sola vez; conserva el vencimiento absoluto de la sesión.
   * @returns Nuevo acceso y refresh internos para emitir la cookie.
   * @throws UnauthorizedException si venció, fue revocado o se reutilizó; la reutilización revoca toda esa sesión.
   */
  async refresh(token: string): Promise<SessionTokens> {
    const claims = await this.refreshClaims(token);
    const result = await this.sessions.manager.transaction(async (manager) => {
      const repository = manager.getRepository(UserSessionEntity);
      const session = await repository.findOne({
        where: { id: claims.sid, userId: claims.sub },
        lock: { mode: 'pessimistic_write' },
      });
      if (
        !session ||
        session.revokedAt ||
        session.expiresAt.getTime() <= Date.now()
      )
        return null;
      if (session.refreshHash !== this.hash(token)) {
        // Solo un refresh con firma válida puede revocar por reutilización; no basta conocer el sid.
        await repository.update({ id: session.id }, { revokedAt: new Date() });
        return null;
      }
      const user = await this.users.findById(session.userId);
      if (!user) return null;
      const tokens = this.tokens(user, session.id, session.expiresAt);
      await repository.update(
        { id: session.id },
        { refreshHash: this.hash(tokens.refreshToken) },
      );
      return tokens;
    });
    // Se lanza fuera de la transacción para conservar la revocación al detectar reutilización.
    if (!result)
      throw new UnauthorizedException(
        'Token de renovación inválido o reutilizado.',
      );
    return result;
  }

  /** Revoca la sesión completa, incluidos los accesos previamente emitidos. */
  async logout(sessionId: string): Promise<void> {
    await this.sessions.update({ id: sessionId }, { revokedAt: new Date() });
  }

  /** Permite cerrar sesión con la cookie aunque el acceso corto haya vencido. */
  async logoutWithRefresh(token: string): Promise<void> {
    const claims = await this.refreshClaims(token);
    await this.logout(claims.sid);
  }

  /** Crea una sesión de duración absoluta; nunca almacena los tokens en texto plano. */
  private async createSession(user: PublicUser): Promise<SessionTokens> {
    const id = randomUUID();
    const expiresAt = new Date(Date.now() + this.options.refreshTtl * 1000);
    const tokens = this.tokens(user, id, expiresAt);
    await this.sessions.save({
      id,
      userId: user.id,
      refreshHash: this.hash(tokens.refreshToken),
      expiresAt,
      revokedAt: null,
    });
    return tokens;
  }

  /** Genera un refresh distinto en cada canje; no amplía la duración máxima de la sesión. */
  private tokens(
    user: PublicUser,
    sid: string,
    expiresAt: Date,
  ): SessionTokens {
    return {
      accessToken: this.jwt.sign(
        { sub: user.id, sid, type: 'access' } satisfies AccessClaims,
        { expiresIn: this.options.accessTtl },
      ),
      tokenType: 'Bearer',
      expiresIn: this.options.accessTtl,
      user,
      refreshToken: this.jwt.sign(
        { sub: user.id, sid, type: 'refresh', jti: randomUUID() },
        {
          expiresIn: Math.max(
            1,
            Math.floor((expiresAt.getTime() - Date.now()) / 1000),
          ),
        },
      ),
      refreshExpiresAt: expiresAt,
    };
  }

  /** Verifica el propósito de renovación para impedir usar un acceso como refresh. */
  private async refreshClaims(token: string): Promise<RefreshClaims> {
    try {
      const claims = await this.jwt.verifyAsync<RefreshClaims>(
        token,
        this.verifyOptions(),
      );
      if (
        claims.type !== 'refresh' ||
        typeof claims.sid !== 'string' ||
        typeof claims.sub !== 'string' ||
        typeof claims.jti !== 'string' ||
        !Number.isFinite(claims.exp)
      )
        throw new Error('Claims inválidos.');
      return claims;
    } catch {
      throw new UnauthorizedException(
        'Token de renovación inválido o vencido.',
      );
    }
  }

  /** Comparte restricciones de firma, emisor y audiencia para ambos tipos de token. */
  private verifyOptions(): JwtVerifyOptions {
    return {
      algorithms: ['HS256'],
      issuer: this.options.issuer,
      audience: this.options.audience,
    };
  }

  /** Resume un token de alta entropía sin permitir recuperar su secreto desde la base de datos. */
  private hash(token: string): string {
    return createHash('sha256').update(token).digest('hex');
  }
}
