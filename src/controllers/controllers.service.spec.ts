import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import type { DataSource } from 'typeorm';
import { GreenhouseEntity } from '../db/entities/greenhouse.entity';
import { ControllerEntity } from './entities/controller.entity';
import { ControllersService } from './controllers.service';

/** Impide reactivar comunicaciones por otra ruta mientras el invernadero permanece desactivado. */
describe('Equipos y desactivación del invernadero', () => {
  const manager = {
    findOne: jest.fn(),
    findOneBy: jest.fn(),
    exists: jest.fn(),
    create: jest.fn(),
    save: jest.fn(),
  };
  const service = new ControllersService({
    transaction: (work: (value: unknown) => unknown) => work(manager),
  } as unknown as DataSource);
  beforeEach(() => {
    jest.resetAllMocks();
    manager.findOneBy.mockResolvedValue({ id: '7', greenhouseId: '2' });
    manager.exists.mockResolvedValue(true);
    manager.create.mockImplementation(
      (_entity: unknown, value: unknown) => value,
    );
    manager.save.mockImplementation((entity: unknown, value?: unknown) =>
      Promise.resolve(value ?? entity),
    );
  });

  it('rechaza registrar un ESP32 en un invernadero desactivado', async () => {
    manager.findOne.mockResolvedValueOnce({ id: '2', status: 'Desactivado' });
    await expect(
      service.create({ greenhouseId: '2', name: 'ESP32' }),
    ).rejects.toThrow(ConflictException);
    expect(manager.save).not.toHaveBeenCalled();
  });

  it('rechaza activar el ESP32 aunque tenga credencial vigente', async () => {
    manager.findOne
      .mockResolvedValueOnce({ id: '2', status: 'Desactivado' })
      .mockResolvedValueOnce({ id: '7', greenhouseId: '2', active: false });
    await expect(service.setActive('7', true)).rejects.toThrow(
      BadRequestException,
    );
    expect(manager.save).not.toHaveBeenCalled();
    expect(
      manager.findOne.mock.calls.map(([entity]: unknown[]) => entity),
    ).toEqual([GreenhouseEntity, ControllerEntity]);
  });

  it('permite bloquear un equipo y conserva la exigencia de una credencial para habilitarlo', async () => {
    manager.findOne
      .mockResolvedValueOnce({ id: '2', status: 'Desactivado' })
      .mockResolvedValueOnce({
        id: '7',
        greenhouseId: '2',
        active: true,
        connectionStatus: 'Conectado',
      });
    await expect(service.setActive('7', false)).resolves.toMatchObject({
      active: false,
      connectionStatus: 'Desconectado',
    });
    manager.findOne
      .mockResolvedValueOnce({ id: '2', status: 'Activo' })
      .mockResolvedValueOnce({ id: '7', greenhouseId: '2', active: false });
    manager.exists.mockResolvedValueOnce(false);
    await expect(service.setActive('7', true)).rejects.toThrow(
      BadRequestException,
    );
  });

  it('solo habilita después de reactivar el invernadero y con credencial vigente', async () => {
    manager.findOne
      .mockResolvedValueOnce({ id: '2', status: 'Activo' })
      .mockResolvedValueOnce({ id: '7', greenhouseId: '2', active: false });
    await expect(service.setActive('7', true)).resolves.toMatchObject({
      active: true,
    });
  });

  it('responde 404 si el equipo dejó de existir', async () => {
    manager.findOneBy.mockResolvedValueOnce(null);
    await expect(service.setActive('7', true)).rejects.toThrow(
      NotFoundException,
    );
    expect(manager.save).not.toHaveBeenCalled();
  });
});
