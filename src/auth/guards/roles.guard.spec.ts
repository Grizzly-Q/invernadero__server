import { ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ExecutionContextHost } from '@nestjs/core/helpers/execution-context-host';
import { Role } from '../../users/role.enum';
import { Roles } from '../decorators/roles.decorator';
import { RolesGuard } from './roles.guard';

/** Controlador de prueba para comprobar la metadata real del decorador. */
@Roles(Role.ADMIN)
class RestrictedController {
  inherited(this: void) {
    return true;
  }

  @Roles(Role.ADMIN)
  admin(this: void) {
    return true;
  }

  @Roles(Role.OPERATOR)
  operator(this: void) {
    return true;
  }

  @Roles(Role.CONTROLLER)
  controller(this: void) {
    return true;
  }

  @Roles(Role.OPERATOR, Role.CONTROLLER)
  shared(this: void) {
    return true;
  }

  @Roles(Role.ADMIN, Role.OPERATOR, Role.CONTROLLER)
  all(this: void) {
    return true;
  }

  @Roles()
  authenticated(this: void) {
    return true;
  }
}

describe('Autorización por roles', () => {
  const guard = new RolesGuard(new Reflector());

  /** Construye el contexto posterior al guard JWT con un rol o sin identidad. */
  function context(method: keyof RestrictedController, role?: Role) {
    return new ExecutionContextHost(
      [{ user: role ? { role } : undefined }],
      RestrictedController,
      RestrictedController.prototype[method],
    );
  }

  const individualRoutes = [
    { method: 'admin', allowed: Role.ADMIN },
    { method: 'operator', allowed: Role.OPERATOR },
    { method: 'controller', allowed: Role.CONTROLLER },
  ] as const;

  describe.each(individualRoutes)(
    'ruta exclusiva $method',
    ({ method, allowed }) => {
      it.each(Object.values(Role))(
        'evalúa el rol %s sin privilegios implícitos',
        (role) => {
          if (role === allowed) {
            expect(guard.canActivate(context(method, role))).toBe(true);
          } else {
            expect(() => guard.canActivate(context(method, role))).toThrow(
              ForbiddenException,
            );
          }
        },
      );
    },
  );

  it.each([Role.OPERATOR, Role.CONTROLLER])(
    'acepta %s cuando la ruta admite Operador o Controlador',
    (role) => {
      expect(guard.canActivate(context('shared', role))).toBe(true);
    },
  );

  it('rechaza al Administrador cuando no está en la lista de la ruta', () => {
    expect(() => guard.canActivate(context('shared', Role.ADMIN))).toThrow(
      ForbiddenException,
    );
  });

  it.each(Object.values(Role))(
    'admite %s cuando se declaran los tres roles',
    (role) => {
      expect(guard.canActivate(context('all', role))).toBe(true);
    },
  );

  it('hereda los roles del controlador si el método no declara otros', () => {
    expect(guard.canActivate(context('inherited', Role.ADMIN))).toBe(true);
    expect(() =>
      guard.canActivate(context('inherited', Role.OPERATOR)),
    ).toThrow(ForbiddenException);
  });

  it('permite cualquier rol autenticado cuando el método declara una lista vacía', () => {
    expect(guard.canActivate(context('authenticated', Role.CONTROLLER))).toBe(
      true,
    );
  });

  it('rechaza una identidad ausente en una ruta con roles', () => {
    expect(() => guard.canActivate(context('admin'))).toThrow(
      ForbiddenException,
    );
  });
});
