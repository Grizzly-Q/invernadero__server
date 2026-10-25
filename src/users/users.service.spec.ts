import { ConflictException } from '@nestjs/common';
import type { Repository } from 'typeorm';
import { PasswordService } from '../auth/password.service';
import { UsersService } from './users.service';
import type { UserEntity } from './entities/user.entity';

/** Comprueba normalización, privacidad y traducción de las cuentas persistentes. */
describe('Cuentas persistentes', () => {
  const repository = {
    create: jest.fn((row: unknown) => row),
    save: jest.fn<Promise<UserEntity>, [UserEntity]>(),
    findOneBy: jest.fn(),
  };
  let users: UsersService;
  beforeEach(() => {
    jest.clearAllMocks();
    repository.save.mockImplementation((row) => Promise.resolve(row));
    users = new UsersService(
      new PasswordService(),
      repository as unknown as Repository<UserEntity>,
    );
  });
  it('crea una identidad sin rol global y oculta el hash', async () => {
    const user = await users.create(
      'Ana',
      ' ANA@example.com ',
      'Clave-segura-123',
    );
    expect(user).toMatchObject({ email: 'ana@example.com' });
    expect(user).not.toHaveProperty('role');
    expect(user).not.toHaveProperty('passwordHash');
    expect(repository.save.mock.calls[0][0]).not.toHaveProperty('role');
    repository.findOneBy.mockResolvedValue(repository.save.mock.calls[0][0]);
    await expect(users.findById(user.id)).resolves.toEqual(user);
  });
  it('traduce el correo duplicado de PostgreSQL a conflicto', async () => {
    repository.save.mockRejectedValue({ driverError: { code: '23505' } });
    await expect(
      users.create('Ana', 'ana@example.com', 'Clave-segura-123'),
    ).rejects.toThrow(ConflictException);
  });
});
