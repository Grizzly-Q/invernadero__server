import { ConfigService } from '@nestjs/config';
import { PasswordService } from '../auth/password.service';
import { Role } from './role.enum';
import { UsersService } from './users.service';

describe('Asignación de roles en el servidor', () => {
  let users: UsersService;

  beforeEach(() => {
    users = new UsersService(new PasswordService(), new ConfigService());
  });

  it('asigna Operador cuando no se indica un rol', async () => {
    const user = await users.create(
      'Prueba',
      'prueba@example.com',
      'Clave-segura-123',
    );
    expect(user.role).toBe(Role.OPERATOR);
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
      expect(users.findById(user.id)?.role).toBe(role);
    },
  );
});
