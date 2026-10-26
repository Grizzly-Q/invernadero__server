import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import type { DataSource, EntityManager } from 'typeorm';
import { QueryFailedError } from 'typeorm';
import { SensorsService } from './sensors.service';
import { sensorUnit } from './sensor-units';
import type { GreenhouseAccessService } from '../greenhouses/greenhouse-access.service';
import { ControllerEntity } from './entities/controller.entity';
import { SensorEntity } from '../telemetry/entities/sensor.entity';
import { MeasurementEntity } from '../telemetry/entities/measurement.entity';
import { validateSensorReading } from '../telemetry/validate-sensor-reading';

/** Persistencia simulada para verificar límites y autorización sin tocar equipos ni PostgreSQL. */
describe('Administración de sensores', () => {
  function escenario({
    active = false,
    historial = false,
    existe = true,
    permitido = true,
  } = {}) {
    const sensor = {
      id: '9',
      controllerId: '7',
      type: 'HumedadAmbiental',
      unit: '%',
      connectionStatus: 'Desconectado',
    } as SensorEntity;
    const manager = {
      findOne: jest.fn((entity: unknown) =>
        Promise.resolve(
          entity === ControllerEntity
            ? { id: '7', greenhouseId: '3', active }
            : existe
              ? sensor
              : null,
        ),
      ),
      existsBy: jest.fn().mockResolvedValue(historial),
      save: jest.fn((_entity: unknown, value: unknown) =>
        Promise.resolve(value),
      ),
      delete: jest.fn().mockResolvedValue({ affected: 1 }),
    };
    const source = {
      transaction: (fn: (manager: EntityManager) => unknown) =>
        fn(manager as unknown as EntityManager),
    } as DataSource;
    const require = jest.fn(() =>
      permitido ? Promise.resolve() : Promise.reject(new ForbiddenException()),
    );
    const servicio = new SensorsService(source, {
      require,
    } as unknown as GreenhouseAccessService);
    return { servicio, manager, require };
  }

  it('corrige humedad anterior a temperatura sin cambiar el identificador ni convertir datos', async () => {
    const { servicio, manager, require } = escenario();
    expect(
      await servicio.change('usuario', '7', '9', { type: 'Temperatura' }),
    ).toMatchObject({ id: '9', type: 'Temperatura', unit: '°C' });
    expect(require).toHaveBeenCalledWith(
      'usuario',
      '3',
      ['ADMIN'],
      expect.anything(),
    );
    expect(manager.findOne).toHaveBeenCalledWith(SensorEntity, {
      where: { id: '9', controllerId: '7' },
      lock: { mode: 'pessimistic_write' },
    });
    expect(manager.existsBy).toHaveBeenCalledWith(MeasurementEntity, {
      sensorId: '9',
    });
  });
  it('elimina solo el sensor indicado sin eliminar mediciones', async () => {
    const { servicio, manager } = escenario();
    expect(await servicio.change('usuario', '7', '9')).toBeUndefined();
    expect(manager.delete).toHaveBeenCalledWith(SensorEntity, {
      id: '9',
      controllerId: '7',
    });
    expect(manager.delete).toHaveBeenCalledTimes(1);
  });
  it.each([undefined, { type: 'Temperatura' as const }])(
    'protege un sensor con historial: %p',
    async (dto) => {
      const { servicio, manager } = escenario({ historial: true });
      await expect(servicio.change('usuario', '7', '9', dto)).rejects.toThrow(
        ConflictException,
      );
      expect(manager.save).not.toHaveBeenCalled();
      expect(manager.delete).not.toHaveBeenCalled();
    },
  );
  it('rechaza cambios con controlador habilitado', async () => {
    const { servicio, manager } = escenario({ active: true });
    await expect(servicio.change('usuario', '7', '9')).rejects.toThrow(
      ConflictException,
    );
    expect(manager.delete).not.toHaveBeenCalled();
  });
  it('rechaza pertenencia revocada aunque el guard haya autorizado antes', async () => {
    const { servicio, manager } = escenario({ permitido: false });
    await expect(servicio.change('usuario', '7', '9')).rejects.toThrow(
      ForbiddenException,
    );
    expect(manager.delete).not.toHaveBeenCalled();
  });
  it('rechaza sensor ajeno o inexistente', async () => {
    const { servicio } = escenario({ existe: false });
    await expect(servicio.change('usuario', '7', '9')).rejects.toThrow(
      NotFoundException,
    );
  });
  it('traduce conflictos de tipo duplicado sin filtrar SQL', async () => {
    const { servicio, manager } = escenario();
    manager.save.mockRejectedValueOnce(
      new QueryFailedError(
        'SQL privado',
        [],
        Object.assign(new Error(), { code: '23505' }),
      ),
    );
    await expect(
      servicio.change('usuario', '7', '9', { type: 'Temperatura' }),
    ).rejects.toThrow('El controlador ya tiene un sensor de ese tipo.');
  });
  it('fija las unidades y rechaza incompatibilidades', () => {
    expect(sensorUnit('Temperatura')).toBe('°C');
    expect(sensorUnit('NivelAgua')).toBe('%');
    expect(sensorUnit('HumedadSuelo')).toBe('%');
    expect(() => sensorUnit('Temperatura', '%')).toThrow(BadRequestException);
    expect(() => sensorUnit('NivelAgua', 'cm')).toThrow(BadRequestException);
  });
  it('admite temperatura bajo cero y superior a cien sin admitir porcentajes inválidos', () => {
    const sensor = { type: 'Temperatura', unit: '°C' } as SensorEntity;
    expect(
      validateSensorReading(sensor, {
        sensorId: '9',
        readingId: 'a',
        value: -5,
      }),
    ).toBeNull();
    expect(
      validateSensorReading(sensor, {
        sensorId: '9',
        readingId: 'a',
        value: 101,
      }),
    ).toBeNull();
    expect(() =>
      validateSensorReading(
        { ...sensor, type: 'HumedadSuelo', unit: '%' },
        { sensorId: '9', readingId: 'a', value: -1 },
      ),
    ).toThrow(BadRequestException);
    expect(() =>
      validateSensorReading(
        { ...sensor, type: 'NivelAgua', unit: '%' },
        { sensorId: '9', readingId: 'a', value: 101 },
      ),
    ).toThrow(BadRequestException);
  });
});
