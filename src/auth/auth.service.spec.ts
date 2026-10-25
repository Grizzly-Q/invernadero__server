import { UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { createHash } from 'node:crypto';
import type { Repository } from 'typeorm';
import { authConfig } from '../config/auth.config';
import type { UsersService } from '../users/users.service';
import { AuthService } from './auth.service';
import type { PasswordService } from './password.service';
import { UserSessionEntity } from './entities/user-session.entity';

/** Prueba tokens firmados reales y persistencia simulada; PostgreSQL se valida en integración por separado. */
describe('Sesiones persistentes y renovación', () => {
  const user = {
    id: '176a8936-3d4e-41ef-b313-153404cd3210',
    name: 'Ana',
    email: 'ana@example.com',
  };
  const options = authConfig({
    JWT_SECRET: 'secreto-de-prueba-con-mas-de-32-bytes',
  });
  const jwt = new JwtService({
    secret: options.secret,
    signOptions: {
      algorithm: 'HS256',
      issuer: options.issuer,
      audience: options.audience,
    },
  });
  let rows: Map<string, UserSessionEntity>;
  let auth: AuthService;
  let repository: Record<string, unknown>;
  const users = { create: jest.fn(), findById: jest.fn() };
  beforeEach(() => {
    rows = new Map();
    users.create.mockResolvedValue(user);
    users.findById.mockResolvedValue(user);
    repository = {
      save: jest.fn((row: UserSessionEntity) => {
        rows.set(row.id, row);
        return Promise.resolve(row);
      }),
      findOneBy: jest.fn(({ id }: { id: string }) =>
        Promise.resolve(rows.get(id) ?? null),
      ),
      findOne: jest.fn(({ where }: { where: { id: string } }) =>
        Promise.resolve(rows.get(where.id) ?? null),
      ),
      update: jest.fn(
        ({ id }: { id: string }, changes: Partial<UserSessionEntity>) => {
          const row = rows.get(id);
          if (row) Object.assign(row, changes);
          return Promise.resolve();
        },
      ),
      manager: {
        transaction: (work: (manager: unknown) => unknown) =>
          Promise.resolve(work({ getRepository: () => repository })),
      },
    };
    auth = new AuthService(
      users as unknown as UsersService,
      {} as PasswordService,
      jwt,
      new ConfigService({ auth: options }),
      repository as unknown as Repository<UserSessionEntity>,
    );
  });
  const register = () =>
    auth.register({
      name: user.name,
      email: user.email,
      password: 'Clave-segura-123',
    });

  it('guarda solo el hash del refresh y autentica accesos tras reconstruir el servicio', async () => {
    const tokens = await register();
    const row = [...rows.values()][0];
    expect(row.refreshHash).toBe(
      createHash('sha256').update(tokens.refreshToken).digest('hex'),
    );
    expect(JSON.stringify(row)).not.toContain(tokens.refreshToken);
    const restarted = new AuthService(
      users as unknown as UsersService,
      {} as PasswordService,
      jwt,
      new ConfigService({ auth: options }),
      repository as unknown as Repository<UserSessionEntity>,
    );
    await expect(restarted.authenticate(tokens.accessToken)).resolves.toEqual({
      user,
      sessionId: row.id,
    });
  });

  it('renueva aunque el acceso venció, rota refresh y mantiene el vencimiento absoluto', async () => {
    const first = await register();
    const row = [...rows.values()][0];
    const expired = jwt.sign(
      { sub: user.id, sid: row.id, type: 'access' },
      { expiresIn: -1 },
    );
    await expect(auth.authenticate(expired)).rejects.toThrow(
      UnauthorizedException,
    );
    const next = await auth.refresh(first.refreshToken);
    expect(next.refreshToken).not.toBe(first.refreshToken);
    expect(next.refreshExpiresAt).toEqual(first.refreshExpiresAt);
    await expect(auth.authenticate(next.accessToken)).resolves.toHaveProperty(
      'user.id',
      user.id,
    );
  });

  it('reutilizar un refresh anterior revoca también el nuevo refresh y los accesos', async () => {
    const first = await register();
    const next = await auth.refresh(first.refreshToken);
    await expect(auth.refresh(first.refreshToken)).rejects.toThrow(
      UnauthorizedException,
    );
    await expect(auth.refresh(next.refreshToken)).rejects.toThrow(
      UnauthorizedException,
    );
    await expect(auth.authenticate(next.accessToken)).rejects.toThrow(
      UnauthorizedException,
    );
    expect([...rows.values()][0].revokedAt).toBeInstanceOf(Date);
  });

  it('rechaza tipos cruzados y tokens alterados sin revocar la sesión legítima', async () => {
    const tokens = await register();
    await expect(auth.refresh(tokens.accessToken)).rejects.toThrow(
      UnauthorizedException,
    );
    await expect(auth.authenticate(tokens.refreshToken)).rejects.toThrow(
      UnauthorizedException,
    );
    await expect(auth.refresh(tokens.refreshToken + 'x')).rejects.toThrow(
      UnauthorizedException,
    );
    await expect(auth.authenticate(tokens.accessToken)).resolves.toHaveProperty(
      'user',
    );
  });

  it('rechaza sesiones vencidas y revoca únicamente la sesión solicitada', async () => {
    const first = await register();
    const second = await register();
    await auth.logoutWithRefresh(first.refreshToken);
    await expect(auth.authenticate(first.accessToken)).rejects.toThrow(
      UnauthorizedException,
    );
    await expect(auth.authenticate(second.accessToken)).resolves.toHaveProperty(
      'user',
    );
    [...rows.values()][1].expiresAt = new Date(0);
    await expect(auth.refresh(second.refreshToken)).rejects.toThrow(
      UnauthorizedException,
    );
  });
});
