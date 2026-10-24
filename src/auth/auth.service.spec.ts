import { UnauthorizedException } from '@nestjs/common';
import { beforeEach, describe, expect, it, jest } from '@jest/globals';
import type { ConfigService } from '@nestjs/config';
import type { JwtService } from '@nestjs/jwt';
import type { Repository } from 'typeorm';
import type { AuthConfig } from '../config/auth.config';
import type { UsersService } from '../users/users.service';
import type { PublicUser } from '../users/user.types';
import type { PasswordService } from './password.service';
import { AuthService } from './auth.service';
import type { UserSessionEntity } from './entities/user-session.entity';

const user: PublicUser = {
  id: 'usuario-uuid',
  name: 'Ana',
  email: 'ana@example.com',
  role: 'OPERATOR' as PublicUser['role'],
};

describe('AuthService: sesiones', () => {
  const sessions = {
    delete: jest.fn(),
    findOneBy: jest.fn(),
    save: jest.fn(),
  };
  const users = {
    create: jest.fn(),
    findById: jest.fn(),
  };
  const passwords = { verify: jest.fn() };
  const jwt = { sign: jest.fn(), verifyAsync: jest.fn() };
  const config = {
    getOrThrow: jest.fn((): AuthConfig => ({
      secret: 'test-secret',
      tokenEncryptionKey: Buffer.alloc(32, 7),
      issuer: 'test-issuer',
      audience: 'test-audience',
      accessTtl: 900,
    })),
  };
  let auth: AuthService;

  beforeEach(() => {
    jest.resetAllMocks();
    config.getOrThrow.mockReturnValue({
      secret: 'test-secret',
      tokenEncryptionKey: Buffer.alloc(32, 7),
      issuer: 'test-issuer',
      audience: 'test-audience',
      accessTtl: 900,
    });
    users.create.mockResolvedValue(user);
    users.findById.mockReturnValue(user);
    jwt.sign.mockReturnValue('signed-jwt');
    sessions.delete.mockResolvedValue({ affected: 1 });
    sessions.save.mockImplementation((session: UserSessionEntity) => session);
    auth = new AuthService(
      users as unknown as UsersService,
      passwords as unknown as PasswordService,
      jwt as unknown as JwtService,
      config as unknown as ConfigService,
      sessions as unknown as Repository<UserSessionEntity>,
    );
  });

  it('guarda el JWT cifrado y no el token en texto plano', async () => {
    const response = await auth.register({
      name: user.name,
      email: user.email,
      password: 'secure-password',
    });

    expect(response.accessToken).toBe('signed-jwt');
    expect(sessions.save).toHaveBeenCalledWith({
      id: expect.any(String),
      userId: user.id,
      encryptedToken: expect.any(String),
      expiresAt: expect.any(Date),
    });
    expect(sessions.save.mock.calls[0][0]).not.toHaveProperty('token');
    expect(sessions.save.mock.calls[0][0].encryptedToken).not.toBe(
      'signed-jwt',
    );
    expect(sessions.save.mock.calls[0][0].encryptedToken).not.toContain(
      'signed-jwt',
    );
  });

  it('descifra y autentica solo si la sesión correspondiente sigue vigente', async () => {
    const expiresAt = new Date(Date.now() + 60_000);
    const response = await auth.register({
      name: user.name,
      email: user.email,
      password: 'secure-password',
    });
    const session = sessions.save.mock.calls[0][0];
    session.expiresAt = expiresAt;
    sessions.findOneBy.mockResolvedValue(session);
    jwt.verifyAsync.mockResolvedValue({
      sub: user.id,
      sid: session.id,
      type: 'access',
      exp: Math.floor(expiresAt.getTime() / 1000),
    });

    await expect(auth.authenticate(response.accessToken)).resolves.toEqual({
      user,
      sessionId: session.id,
    });
    expect(sessions.findOneBy).toHaveBeenCalledWith({
      id: session.id,
      userId: user.id,
    });
  });

  it('rechaza una sesión cuyo token cifrado fue alterado', async () => {
    const expiresAt = new Date(Date.now() + 60_000);
    jwt.verifyAsync.mockResolvedValue({
      sub: user.id,
      sid: 'session-uuid',
      type: 'access',
      exp: Math.floor(expiresAt.getTime() / 1000),
    });
    sessions.findOneBy.mockResolvedValue({
      id: 'session-uuid',
      userId: user.id,
      encryptedToken: 'Y2lwaGVydGV4dG8=',
      expiresAt,
    });

    await expect(auth.authenticate('signed-jwt')).rejects.toThrow(
      UnauthorizedException,
    );
  });

  it('rechaza sesiones revocadas y elimina la sesión al cerrar sesión', async () => {
    jwt.verifyAsync.mockResolvedValue({
      sub: user.id,
      sid: 'session-uuid',
      type: 'access',
      exp: Math.floor(Date.now() / 1000) + 60,
    });
    sessions.findOneBy.mockResolvedValue(null);

    await expect(auth.authenticate('signed-jwt')).rejects.toThrow(
      UnauthorizedException,
    );
    await auth.logout('session-uuid');
    expect(sessions.delete).toHaveBeenLastCalledWith({ id: 'session-uuid' });
  });
});
