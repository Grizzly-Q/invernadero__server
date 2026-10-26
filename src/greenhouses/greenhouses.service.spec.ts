import { ForbiddenException, NotFoundException } from '@nestjs/common';
import type { DataSource } from 'typeorm';
import { GreenhouseEntity } from '../db/entities/greenhouse.entity';
import { ControllerEntity } from '../controllers/entities/controller.entity';
import { SensorEntity } from '../telemetry/entities/sensor.entity';
import { Role } from '../users/role.enum';
import { GreenhouseAccessService } from './greenhouse-access.service';
import { GreenhousesService } from './greenhouses.service';

/** Comprueba aislamiento entre invernaderos y creación indivisible de invernadero y pertenencia. */
describe('Invernaderos y pertenencias', () => {
  const dto = {
    name: 'Mi invernadero',
    location: 'Lima',
    length: 10,
    width: 5,
  };
  const access = { schema: () => '"prueba"', require: jest.fn() };
  const manager = {
    findOne: jest.fn(),
    findOneBy: jest.fn(),
    create: jest.fn((_type: unknown, row: unknown) => row),
    save: jest.fn(),
    query: jest.fn(),
    update: jest.fn(),
  };
  let transaction: jest.Mock;
  let service: GreenhousesService;
  beforeEach(() => {
    jest.clearAllMocks();
    access.require.mockReset().mockResolvedValue(Role.ADMIN);
    manager.findOne.mockReset();
    manager.update.mockReset().mockResolvedValue({ affected: 1 });
    manager.findOneBy.mockResolvedValue({
      id: 'ana',
      databaseId: '9007199254740993',
    });
    manager.save.mockImplementation(
      (_type: unknown, row: Record<string, unknown>) =>
        Promise.resolve({ id: '2', ...row }),
    );
    manager.query.mockResolvedValue([]);
    transaction = jest.fn((work: (manager: unknown) => Promise<unknown>) =>
      work(manager),
    );
    service = new GreenhousesService(
      { transaction } as unknown as DataSource,
      access as unknown as GreenhouseAccessService,
    );
  });
  it('asigna ADMIN solo al creador en la misma transacción y conserva claves bigint', async () => {
    await expect(service.create('ana', dto)).resolves.toHaveProperty(
      'role',
      Role.ADMIN,
    );
    expect(transaction).toHaveBeenCalledTimes(1);
    expect(manager.save).toHaveBeenCalledWith(
      GreenhouseEntity,
      expect.anything(),
    );
    expect(manager.query).toHaveBeenCalledWith(
      expect.stringContaining("VALUES ($1, $2, 'ADMIN')"),
      ['9007199254740993', '2'],
    );
  });
  it('propaga un fallo de pertenencia para que PostgreSQL revierta la transacción', async () => {
    manager.query.mockRejectedValueOnce(new Error('Fallo de escritura'));
    await expect(service.create('ana', dto)).rejects.toThrow(
      'Fallo de escritura',
    );
  });
  it('impide consultar miembros sin ser administrador del invernadero solicitado', async () => {
    access.require.mockRejectedValueOnce(new ForbiddenException());
    await expect(service.members('ana', 'otro')).rejects.toThrow(
      ForbiddenException,
    );
    expect(access.require).toHaveBeenCalledWith('ana', 'otro', [Role.ADMIN]);
  });

  const greenhouse = () => ({
    id: '2',
    name: 'Norte',
    location: 'Lima',
    length: '10.00',
    width: '5.00',
    height: '3.00',
    description: 'Original',
    status: 'Desactivado',
    operationMode: 'Manual',
  });

  it('edita parcialmente y limpia opcionales sin reactivar ni modificar dimensiones omitidas', async () => {
    manager.findOne.mockResolvedValueOnce(greenhouse());
    const result = await service.update('ana', '2', {
      name: 'Sur',
      height: null,
      description: null,
    });
    expect(result).toMatchObject({
      name: 'Sur',
      height: null,
      description: null,
      length: '10.00',
      width: '5.00',
      status: 'Desactivado',
    });
    expect(access.require).toHaveBeenCalledWith(
      'ana',
      '2',
      [Role.ADMIN],
      manager,
    );
    expect(manager.findOne).toHaveBeenCalledWith(GreenhouseEntity, {
      where: { id: '2' },
      lock: { mode: 'pessimistic_write' },
    });
    expect(manager.update).not.toHaveBeenCalled();
  });

  it('convierte dimensiones numéricas sin asignar estado ni propiedades ajenas del cuerpo', async () => {
    manager.findOne.mockResolvedValueOnce(greenhouse());
    const result = await service.update('ana', '2', {
      length: 12.25,
      width: 2.5,
      height: 4,
      status: 'Activo',
      role: Role.OPERATOR,
    } as Parameters<GreenhousesService['update']>[2]);
    expect(result).toMatchObject({
      length: '12.25',
      width: '2.5',
      height: '4',
      status: 'Desactivado',
      role: Role.ADMIN,
    });
  });

  it.each(['update', 'setStatus'] as const)(
    'rechaza %s antes de consultar o escribir si falta ADMIN',
    async (operation) => {
      access.require.mockRejectedValueOnce(new ForbiddenException());
      const work =
        operation === 'update'
          ? service.update('operador', '2', { name: 'Ajeno' })
          : service.setStatus('operador', '2', 'Desactivado');
      await expect(work).rejects.toThrow(ForbiddenException);
      expect(manager.findOne).not.toHaveBeenCalled();
      expect(manager.save).not.toHaveBeenCalled();
      expect(manager.update).not.toHaveBeenCalled();
    },
  );

  it('desactiva el recurso, bloquea el equipo y desconecta sensores bajo el mismo bloqueo transaccional', async () => {
    manager.findOne
      .mockResolvedValueOnce({ ...greenhouse(), status: 'Activo' })
      .mockResolvedValueOnce({ id: '7', active: true });
    const result = await service.setStatus('ana', '2', 'Desactivado');
    expect(result.status).toBe('Desactivado');
    expect(
      manager.findOne.mock.calls.map(([entity]: unknown[]) => entity),
    ).toEqual([GreenhouseEntity, ControllerEntity]);
    expect(manager.update).toHaveBeenNthCalledWith(1, ControllerEntity, '7', {
      active: false,
      connectionStatus: 'Desconectado',
    });
    expect(manager.update).toHaveBeenNthCalledWith(
      2,
      SensorEntity,
      { controllerId: '7' },
      { connectionStatus: 'Desconectado' },
    );
    expect(transaction).toHaveBeenCalledTimes(1);
  });

  it('permite desactivar sin equipo y reactivar sin habilitarlo ni tocar sus credenciales', async () => {
    manager.findOne
      .mockResolvedValueOnce(greenhouse())
      .mockResolvedValueOnce(null);
    await expect(
      service.setStatus('ana', '2', 'Desactivado'),
    ).resolves.toHaveProperty('status', 'Desactivado');
    expect(manager.update).not.toHaveBeenCalled();
    manager.findOne.mockClear().mockResolvedValueOnce(greenhouse());
    await expect(
      service.setStatus('ana', '2', 'Activo'),
    ).resolves.toHaveProperty('status', 'Activo');
    expect(manager.findOne).toHaveBeenCalledTimes(1);
    expect(manager.update).not.toHaveBeenCalled();
  });

  it('propaga fallos de desconexión para que la transacción revierta los cambios del equipo', async () => {
    manager.findOne
      .mockResolvedValueOnce(greenhouse())
      .mockResolvedValueOnce({ id: '7' });
    manager.update
      .mockResolvedValueOnce({ affected: 1 })
      .mockRejectedValueOnce(new Error('Fallo de sensores'));
    await expect(service.setStatus('ana', '2', 'Desactivado')).rejects.toThrow(
      'Fallo de sensores',
    );
    expect(manager.save).not.toHaveBeenCalled();
  });

  it.each(['update', 'setStatus'] as const)(
    'responde sin escrituras si %s encuentra que el recurso dejó de existir',
    async (operation) => {
      manager.findOne.mockResolvedValueOnce(null);
      const work =
        operation === 'update'
          ? service.update('ana', '2', {})
          : service.setStatus('ana', '2', 'Desactivado');
      await expect(work).rejects.toThrow(NotFoundException);
      expect(manager.save).not.toHaveBeenCalled();
    },
  );
});

describe('Autorización persistente por pertenencia', () => {
  const query = jest.fn();
  const source = {
    options: { type: 'postgres', schema: 'prueba' },
    driver: { escape: (value: string) => `"${value}"` },
    query,
  };
  const access = new GreenhouseAccessService(source as unknown as DataSource);
  beforeEach(() => {
    jest.resetAllMocks();
  });
  it('una persona puede ser ADMIN en uno y OPERATOR en otro sin heredar permisos', async () => {
    query
      .mockResolvedValueOnce([{ role: Role.ADMIN }])
      .mockResolvedValueOnce([{ role: Role.OPERATOR }])
      .mockResolvedValueOnce([{ role: Role.OPERATOR }]);
    await expect(access.require('ana', '1', [Role.ADMIN])).resolves.toBe(
      Role.ADMIN,
    );
    await expect(access.require('ana', '2')).resolves.toBe(Role.OPERATOR);
    await expect(access.require('ana', '2', [Role.ADMIN])).rejects.toThrow(
      ForbiddenException,
    );
    expect(query).toHaveBeenLastCalledWith(expect.any(String), ['ana', '2']);
  });
  it('rechaza cuentas sin pertenencia y vuelve a consultar al revocarla', async () => {
    query
      .mockResolvedValueOnce([{ role: Role.ADMIN }])
      .mockResolvedValueOnce([]);
    await expect(access.require('ana', '1')).resolves.toBe(Role.ADMIN);
    await expect(access.require('ana', '1')).rejects.toThrow(
      ForbiddenException,
    );
    expect(query).toHaveBeenCalledTimes(2);
  });
  it('comparte la conexión transaccional y bloquea la pertenencia durante una escritura', async () => {
    const queryTransaccional = jest
      .fn()
      .mockResolvedValue([{ role: Role.ADMIN }]);
    await expect(
      access.require('ana', '1', [Role.ADMIN], {
        query: queryTransaccional,
      } as unknown as import('typeorm').EntityManager),
    ).resolves.toBe(Role.ADMIN);
    expect(query).not.toHaveBeenCalled();
    expect(queryTransaccional).toHaveBeenCalledWith(
      expect.stringContaining('FOR SHARE OF m'),
      ['ana', '1'],
    );
  });
});
