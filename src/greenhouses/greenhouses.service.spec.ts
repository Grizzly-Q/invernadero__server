import { ForbiddenException } from '@nestjs/common';
import type { DataSource } from 'typeorm';
import { GreenhouseEntity } from '../db/entities/greenhouse.entity';
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
    findOneBy: jest.fn(),
    create: jest.fn((_type: unknown, row: unknown) => row),
    save: jest.fn(),
    query: jest.fn(),
  };
  let transaction: jest.Mock;
  let service: GreenhousesService;
  beforeEach(() => {
    jest.clearAllMocks();
    manager.findOneBy.mockResolvedValue({
      id: 'ana',
      databaseId: '9007199254740993',
    });
    manager.save.mockResolvedValue({ id: '2', ...dto });
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
});
