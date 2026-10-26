import { ForbiddenException } from '@nestjs/common';
import type { DataSource } from 'typeorm';
import { GreenhouseEntity } from '../db/entities/greenhouse.entity';
import { ControllerEntity } from '../controllers/entities/controller.entity';
import { GreenhousesService } from './greenhouses.service';
import { GreenhouseAccessService } from './greenhouse-access.service';

/** Comprueba el acceso al inventario sin heredar privilegios administrativos sobre equipos. */
describe('Sensores para historial por invernadero', () => {
  const access = { require: jest.fn() };
  const house = { findOneBy: jest.fn() };
  const controller = { findOneBy: jest.fn() };
  const sensor = { find: jest.fn() };
  const repository = jest.fn((entity: unknown) =>
    entity === GreenhouseEntity
      ? house
      : entity === ControllerEntity
        ? controller
        : sensor,
  );
  const service = new GreenhousesService(
    { getRepository: repository } as unknown as DataSource,
    access as unknown as GreenhouseAccessService,
  );
  beforeEach(() => {
    jest.clearAllMocks();
    access.require.mockReset().mockResolvedValue('OPERATOR');
    house.findOneBy.mockResolvedValue({ id: '2', status: 'Desactivado' });
    controller.findOneBy.mockResolvedValue({
      id: '7',
      greenhouseId: '2',
      active: false,
    });
    sensor.find.mockResolvedValue([
      {
        id: '9',
        controllerId: '7',
        type: 'NivelAgua',
        unit: 'cm',
        connectionStatus: 'Desconectado',
        credential: 'no-exponer',
      },
    ]);
  });
  it.each(['ADMIN', 'OPERATOR'])(
    'permite consultar como %s con el invernadero desactivado y proyecta solo datos públicos',
    async (role) => {
      access.require.mockResolvedValueOnce(role);
      await expect(service.sensors('ana', '2')).resolves.toEqual({
        greenhouseId: '2',
        controllerId: '7',
        items: [
          {
            id: '9',
            controllerId: '7',
            type: 'NivelAgua',
            unit: 'cm',
            connectionStatus: 'Desconectado',
          },
        ],
      });
      expect(access.require).toHaveBeenCalledWith('ana', '2');
      expect(controller.findOneBy).toHaveBeenCalledWith({ greenhouseId: '2' });
      expect(sensor.find).toHaveBeenCalledWith(
        expect.objectContaining({ where: { controllerId: '7' } }),
      );
    },
  );
  it('rechaza un invernadero ajeno antes de consultar sus equipos', async () => {
    access.require.mockRejectedValueOnce(new ForbiddenException());
    await expect(service.sensors('ajeno', '2')).rejects.toThrow(
      ForbiddenException,
    );
    expect(repository).not.toHaveBeenCalled();
  });
  it('distingue invernadero sin equipo de equipo sin sensores', async () => {
    controller.findOneBy.mockResolvedValueOnce(null);
    await expect(service.sensors('ana', '2')).resolves.toEqual({
      greenhouseId: '2',
      controllerId: null,
      items: [],
    });
    expect(sensor.find).not.toHaveBeenCalled();
    sensor.find.mockResolvedValueOnce([]);
    await expect(service.sensors('ana', '2')).resolves.toEqual({
      greenhouseId: '2',
      controllerId: '7',
      items: [],
    });
  });
});
