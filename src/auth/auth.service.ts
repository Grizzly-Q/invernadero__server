import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import {
  createCipheriv,
  createDecipheriv,
  randomBytes,
  randomUUID,
  timingSafeEqual,
} from 'node:crypto';
import { InjectRepository } from '@nestjs/typeorm';
import { LessThanOrEqual, Repository } from 'typeorm';
import { UsersService } from '../users/users.service';
import type { PublicUser } from '../users/user.types';
import type { AuthConfig } from '../config/auth.config';
import type { AccessClaims, TokenResponse } from './auth.types';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { PasswordService } from './password.service';
import { UserSessionEntity } from './entities/user-session.entity';

/** Emite un JWT por sesión y persiste su vigencia y revocación en PostgreSQL. */
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

  /** Registra un Operador y devuelve una nueva sesión; rechaza correos repetidos. */
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
      const session = await this.sessions.findOneBy({
        id: claims.sid,
        userId: claims.sub,
      });
      const user = this.users.findById(claims.sub);
      if (
        !session ||
        session.expiresAt.getTime() <= Date.now() ||
        !user ||
        !this.matchesToken(token, session.encryptedToken)
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
  async logout(sessionId: string): Promise<void> {
    await this.sessions.delete({ id: sessionId });
  }

  private async createSession(user: PublicUser): Promise<TokenResponse> {
    await this.sessions.delete({ expiresAt: LessThanOrEqual(new Date()) });
    return this.issueToken(user, randomUUID());
  }

  private async issueToken(
    user: PublicUser,
    sessionId: string,
  ): Promise<TokenResponse> {
    const accessToken = this.jwt.sign(
      { sub: user.id, sid: sessionId, type: 'access' } satisfies AccessClaims,
      { expiresIn: this.options.accessTtl },
    );
    await this.sessions.save({
      id: sessionId,
      userId: user.id,
      encryptedToken: this.encryptToken(accessToken),
      expiresAt: new Date(Date.now() + this.options.accessTtl * 1000),
    });
    return {
      accessToken,
      tokenType: 'Bearer',
      expiresIn: this.options.accessTtl,
      user,
    };
  }
  private encryptToken(token: string): string {
    const iv = randomBytes(12);
    const cipher = createCipheriv(
      'aes-256-gcm',
      this.options.tokenEncryptionKey,
      iv,
    );
    const ciphertext = Buffer.concat([
      cipher.update(token, 'utf8'),
      cipher.final(),
    ]);
    return Buffer.concat([iv, cipher.getAuthTag(), ciphertext]).toString(
      'base64',
    );
  }
  private matchesToken(token: string, encryptedToken: string): boolean {
    const payload = Buffer.from(encryptedToken, 'base64');
    if (payload.length <= 28 || payload.toString('base64') !== encryptedToken) {
      return false;
    }
    const decipher = createDecipheriv(
      'aes-256-gcm',
      this.options.tokenEncryptionKey,
      payload.subarray(0, 12),
    );
    decipher.setAuthTag(payload.subarray(12, 28));
    const decryptedToken = Buffer.concat([
      decipher.update(payload.subarray(28)),
      decipher.final(),
    ]);
    const presentedToken = Buffer.from(token, 'utf8');
    return (
      decryptedToken.length === presentedToken.length &&
      timingSafeEqual(decryptedToken, presentedToken)
    );
  }
}
