import {
  InternalServerErrorException,
  UnauthorizedException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { ExecutionContextHost } from '@nestjs/core/helpers/execution-context-host';
import type { AuthService } from '../auth.service';
import type { ControllerCredentialsService } from '../../controllers/controller-credentials.service';
import { Role } from '../../users/role.enum';
import { DeviceOnly } from '../decorators/device-only.decorator';
import { Public } from '../decorators/public.decorator';
import { Roles } from '../decorators/roles.decorator';
import { AuthenticationGuard } from './authentication.guard';

/** Rutas ficticias para comprobar la selección del mecanismo con metadata real. */
class Routes {
  user(this: void) {}
  @DeviceOnly()
  device(this: void) {}
  @Public()
  public(this: void) {}
  @Public()
  @DeviceOnly()
  contradictory(this: void) {}
  @Roles(Role.ADMIN)
  @DeviceOnly()
  contradictoryRole(this: void) {}
}

describe('Selección de identidad de usuario o controlador', () => {
  const auth = { authenticate: jest.fn() };
  const controllers = { authenticate: jest.fn() };
  const guard = new AuthenticationGuard(
    new Reflector(),
    auth as unknown as AuthService,
    controllers as unknown as ControllerCredentialsService,
  );

  beforeEach(() => {
    jest.resetAllMocks();
    auth.authenticate.mockResolvedValue({
      user: { id: 'usuario' },
      sessionId: 'sesion',
    });
    controllers.authenticate.mockResolvedValue({
      id: '1',
      greenhouseId: '2',
      credentialId: '3',
    });
  });

  /** Crea una petición de prueba sin ejecutar middleware HTTP. */
  function context(
    method: keyof Routes,
    authorization?: string,
    rawHeaders: string[] = [],
  ) {
    const request: Record<string, unknown> = {
      headers: { authorization },
      rawHeaders,
    };
    return {
      request,
      execution: new ExecutionContextHost(
        [request],
        Routes,
        Routes.prototype[method],
      ),
    };
  }

  it('exige JWT por defecto y no intenta autenticar como dispositivo', async () => {
    const { request, execution } = context('user', 'Bearer jwt-prueba');
    expect(await guard.canActivate(execution)).toBe(true);
    expect(auth.authenticate).toHaveBeenCalledWith('jwt-prueba');
    expect(controllers.authenticate).not.toHaveBeenCalled();
    expect(request).toMatchObject({
      user: { id: 'usuario' },
      sessionId: 'sesion',
    });
    expect(request).not.toHaveProperty('controller');
  });

  it('incorpora únicamente identidad de equipo en una ruta DeviceOnly', async () => {
    const { request, execution } = context('device', 'Bearer clave-prueba');
    expect(await guard.canActivate(execution)).toBe(true);
    expect(controllers.authenticate).toHaveBeenCalledWith('clave-prueba');
    expect(auth.authenticate).not.toHaveBeenCalled();
    expect(request).toHaveProperty('controller');
    expect(request).not.toHaveProperty('user');
  });

  it('permite rutas públicas sin buscar credenciales', async () => {
    expect(await guard.canActivate(context('public').execution)).toBe(true);
    expect(auth.authenticate).not.toHaveBeenCalled();
    expect(controllers.authenticate).not.toHaveBeenCalled();
  });

  it.each(['contradictory', 'contradictoryRole'] as const)(
    'rechaza metadata incompatible en %s',
    async (method) => {
      await expect(
        guard.canActivate(context(method).execution),
      ).rejects.toThrow(InternalServerErrorException);
    },
  );

  it.each([
    undefined,
    'Basic clave',
    'Bearer a b',
    `Bearer ${'a'.repeat(2049)}`,
  ])(
    'rechaza ausencia, formato ambiguo o exceso de longitud',
    async (header) => {
      await expect(
        guard.canActivate(context('device', header).execution),
      ).rejects.toThrow(UnauthorizedException);
    },
  );

  it('rechaza encabezados Authorization duplicados aunque Node haya conservado solo uno', async () => {
    const { execution } = context('device', 'Bearer primera', [
      'Authorization',
      'Bearer primera',
      'authorization',
      'Bearer segunda',
    ]);
    await expect(guard.canActivate(execution)).rejects.toThrow(
      UnauthorizedException,
    );
    expect(controllers.authenticate).not.toHaveBeenCalled();
  });
});
