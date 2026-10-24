import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { In } from 'typeorm';
import { ControllerCredentialsService } from '../controllers/controller-credentials.service';
import type { ControllerIdentity } from '../controllers/controller.types';
import { SensorEntity } from './entities/sensor.entity';
import { MeasurementEntity } from './entities/measurement.entity';
import type { ReceiveTelemetryDto } from './dto/receive-telemetry.dto';
import { validateSensorReading } from './validate-sensor-reading';

/** Recibe lecturas persistentes únicamente para sensores del equipo autenticado. */
@Injectable()
export class TelemetryService {
  constructor(private readonly credentials: ControllerCredentialsService) {}

  /**
   * Guarda un lote en una transacción y reconoce reintentos con contenido idéntico.
   * @param identity Identidad verificada por el guard, no enviada dentro del JSON.
   * @param dto Lecturas validadas; no admite hora de recepción proporcionada por el equipo.
   * @returns Cantidades insertadas y repetidas sin alterar recepciones previas.
   * @throws ForbiddenException para sensores ajenos; ConflictException si un identificador se reutiliza con otro contenido.
   */
  async receive(identity: ControllerIdentity, dto: ReceiveTelemetryDto) {
    return this.credentials.withController(
      identity,
      async (controller, manager) => {
        const keys = dto.readings.map(
          ({ sensorId, readingId }) => `${sensorId}/${readingId}`,
        );
        if (new Set(keys).size !== keys.length)
          throw new BadRequestException(
            'El lote contiene identificadores de lectura repetidos para un sensor.',
          );
        const ids = [
          ...new Set(dto.readings.map((reading) => reading.sensorId)),
        ];
        const sensors = await manager.find(SensorEntity, {
          where: { id: In(ids), controllerId: controller.id },
        });
        if (sensors.length !== ids.length)
          throw new ForbiddenException(
            'Todos los sensores deben pertenecer al controlador autenticado.',
          );
        const byId = new Map(sensors.map((sensor) => [sensor.id, sensor]));
        const prepared = dto.readings.map((reading) => {
          const sensor = byId.get(reading.sensorId)!;
          const measuredAt = validateSensorReading(sensor, reading);
          return manager.create(MeasurementEntity, {
            sensorId: reading.sensorId,
            readingId: reading.readingId,
            measuredAt,
            value: reading.value.toFixed(2),
          });
        });
        const existing = await manager.find(MeasurementEntity, {
          where: prepared.map(({ sensorId, readingId }) => ({
            sensorId,
            readingId,
          })),
        });
        const previous = new Map(
          existing.map((reading) => [
            `${reading.sensorId}/${reading.readingId}`,
            reading,
          ]),
        );
        const pending: MeasurementEntity[] = [];
        for (const reading of prepared) {
          const stored = previous.get(
            `${reading.sensorId}/${reading.readingId}`,
          );
          if (!stored) {
            pending.push(reading);
            continue;
          }
          if (
            stored.value !== reading.value ||
            stored.measuredAt?.getTime() !== reading.measuredAt?.getTime()
          )
            throw new ConflictException(
              'Un identificador de lectura ya existe con otro valor u hora.',
            );
        }
        // El bloqueo del controlador serializa inserciones y evita carreras entre reintentos simultáneos.
        if (pending.length) await manager.insert(MeasurementEntity, pending);
        await manager.update(
          SensorEntity,
          { id: In(ids), controllerId: controller.id },
          { connectionStatus: 'Conectado' },
        );
        return {
          controllerId: controller.id,
          received: prepared.length,
          inserted: pending.length,
          duplicates: prepared.length - pending.length,
        };
      },
    );
  }
}
