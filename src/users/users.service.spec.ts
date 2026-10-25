import { ConfigService } from '@nestjs/config';
import type { Repository } from 'typeorm';
import { PasswordService } from '../auth/password.service';
import { Role } from './role.enum';
import type { UserAccountEntity } from './entities/user-account.entity';
import { UsersService } from './users.service';

describe('Asignación de roles en el servidor', () => {
  let users: UsersService;
  const records = new Map<string, UserAccountEntity>();
  const accounts = {
    create: jest.fn((account: UserAccountEntity) => account),
    insert: jest.fn(async (account: UserAccountEntity) => {
      records.set(account.id, account);
      return { identifiers: [{ id: account.id }], generatedMaps: [], raw: [] };
    }),
    findOne: jest.fn(
      async (options: { where: { email: string } }) =>
        [...records.values()].find(
          (account) => account.email === options.where.email,
        ) ?? null,
    ),
    findOneBy: jest.fn(
      async (where: { id: string }) => records.get(where.id) ?? null,
    ),
    find: jest.fn(async () => [...records.values()]),
  };

  beforeEach(() => {
    records.clear();
    users = new UsersService(
      new PasswordService(),
      new ConfigService(),
      accounts as unknown as Repository<UserAccountEntity>,
    );
  });

  it('asigna Operador cuando no se indica un rol', async () => {
    const user = await users.create(
      'Prueba',
      'prueba@example.com',
      'Clave-segura-123',
    );
    expect(user.role).toBe(Role.OPERATOR);
  });

  it('recupera la cuenta registrada desde otra instancia con correo normalizado', async () => {
    const created = await users.create(
      'Prueba',
      '  PRUEBA@example.com ',
      'Clave-segura-123',
    );
    const restartedUsers = new UsersService(
      new PasswordService(),
      new ConfigService(),
      accounts as unknown as Repository<UserAccountEntity>,
    );

    await expect(
      restartedUsers.findByEmail('prueba@example.com'),
    ).resolves.toMatchObject({
      id: created.id,
      email: 'prueba@example.com',
      role: Role.OPERATOR,
      passwordHash: expect.any(String),
    });
    expect(created).not.toHaveProperty('passwordHash');
  });

  it.each(Object.values(Role))(
    'conserva el rol %s asignado explícitamente por el servidor',
    async (role) => {
      const user = await users.create(
        'Prueba',
        'prueba@example.com',
        'Clave-segura-123',
        role,
      );
      expect(user.role).toBe(role);
      expect((await users.findById(user.id))?.role).toBe(role);
    },
  );
});
