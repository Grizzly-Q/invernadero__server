import { ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ExecutionContextHost } from '@nestjs/core/helpers/execution-context-host';
import type { DataSource } from 'typeorm';
import type { GreenhouseAccessService } from '../../greenhouses/greenhouse-access.service';
import { Role } from '../../users/role.enum';
import { Roles } from '../decorators/roles.decorator';
import { ControllerScope } from '../decorators/controller-scope.decorator';
import { RolesGuard } from './roles.guard';

@ControllerScope()
@Roles(Role.ADMIN)
class Routes {
  admin(this: void) {}
  @Roles() list(this: void) {}
}

/** Comprueba la resolución del recurso y el rechazo de privilegios de otro invernadero. */
describe('Roles por invernadero', () => {
  const access = { require: jest.fn() };
  const repository = { findOneBy: jest.fn() };
  const source = { getRepository: () => repository };
  const guard = new RolesGuard(
    new Reflector(),
    access as unknown as GreenhouseAccessService,
    source as unknown as DataSource,
  );
  const context = (method: keyof Routes, request: unknown) =>
    new ExecutionContextHost([request], Routes, Routes.prototype[method]);
  beforeEach(() => {
    jest.resetAllMocks();
    repository.findOneBy.mockResolvedValue({ greenhouseId: '2' });
    access.require.mockResolvedValue(Role.ADMIN);
  });
  it('resuelve el invernadero real del controlador e ignora un rol o invernadero enviados en el cuerpo', async () => {
    await expect(
      guard.canActivate(
        context('admin', {
          user: { id: 'ana', role: 'ADMIN' },
          params: { id: '1' },
          body: { greenhouseId: '99' },
        }),
      ),
    ).resolves.toBe(true);
    expect(access.require).toHaveBeenCalledWith('ana', '2', [Role.ADMIN]);
  });
  it('rechaza al administrador de otro invernadero y al operador sin ejecutar la operación', async () => {
    access.require.mockRejectedValue(new ForbiddenException());
    await expect(
      guard.canActivate(
        context('admin', { user: { id: 'ana' }, params: { id: '1' } }),
      ),
    ).rejects.toThrow(ForbiddenException);
  });
  it('comprueba el invernadero al registrar un equipo', async () => {
    await guard.canActivate(
      context('admin', {
        user: { id: 'ana' },
        params: {},
        body: { greenhouseId: '3' },
      }),
    );
    expect(access.require).toHaveBeenCalledWith('ana', '3', [Role.ADMIN]);
  });
  it('permite la ruta de listado que aplica su propio filtro de pertenencias', async () => {
    await expect(
      guard.canActivate(context('list', { user: { id: 'ana' } })),
    ).resolves.toBe(true);
    expect(access.require).not.toHaveBeenCalled();
  });
});
