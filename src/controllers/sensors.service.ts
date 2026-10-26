import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DataSource, QueryFailedError } from 'typeorm';
import { ControllerEntity } from './entities/controller.entity';
import { SensorEntity } from '../telemetry/entities/sensor.entity';
import { MeasurementEntity } from '../telemetry/entities/measurement.entity';
import { GreenhouseAccessService } from '../greenhouses/greenhouse-access.service';
import { Role } from '../users/role.enum';
import type { CreateSensorDto } from './dto/controller.dto';
import { sensorUnit } from './sensor-units';

/** Corrige o elimina registros sin historial; serializa cambios con la recepción del ESP32. */
@Injectable()
export class SensorsService {
  constructor(
    private readonly source: DataSource,
    private readonly access: GreenhouseAccessService,
  ) {}

  /**
   * Edita tipo/unidad o elimina un sensor del controlador indicado.
   * @param userId Cuenta humana; se vuelve a comprobar su pertenencia ADMIN dentro de la transacción.
   * @param controllerId Controlador propietario, que debe estar bloqueado antes de modificar sensores.
   * @param sensorId Sensor existente; no acepta sensores de otro controlador.
   * @param dto Nuevo tipo y unidad; omitir elimina el registro sin borrar mediciones.
   * @returns Sensor actualizado o undefined tras eliminarlo.
   * @throws NotFoundException si el recurso no existe; ConflictException si está activo, tiene historial o duplica tipo.
   */
  async change(
    userId: string,
    controllerId: string,
    sensorId: string,
    dto?: CreateSensorDto,
  ): Promise<SensorEntity | undefined> {
    try {
      return await this.source.transaction(async (manager) => {
        const controller = await manager.findOne(ControllerEntity, {
          where: { id: controllerId },
          lock: { mode: 'pessimistic_write' },
        });
        if (!controller)
          throw new NotFoundException('Controlador no encontrado.');
        await this.access.require(
          userId,
          controller.greenhouseId,
          [Role.ADMIN],
          manager,
        );
        if (controller.active)
          throw new ConflictException(
            'Bloquea las comunicaciones del controlador antes de editar o eliminar sensores.',
          );
        const sensor = await manager.findOne(SensorEntity, {
          where: { id: sensorId, controllerId },
          lock: { mode: 'pessimistic_write' },
        });
        if (!sensor)
          throw new NotFoundException(
            'Sensor no encontrado en este controlador.',
          );
        const unit = dto ? sensorUnit(dto.type, dto.unit) : undefined;
        if (dto && sensor.type === dto.type && sensor.unit === unit)
          return sensor;
        if (await manager.existsBy(MeasurementEntity, { sensorId }))
          throw new ConflictException(
            'El sensor tiene mediciones. No se puede eliminar ni cambiar su tipo o unidad para conservar el historial.',
          );
        if (!dto) {
          await manager.delete(SensorEntity, { id: sensorId, controllerId });
          return;
        }
        sensor.type = dto.type;
        sensor.unit = unit!;
        sensor.connectionStatus = 'Desconectado';
        return manager.save(SensorEntity, sensor);
      });
    } catch (error) {
      if (
        error instanceof QueryFailedError &&
        (error.driverError as { code?: string }).code === '23505'
      )
        throw new ConflictException(
          'El controlador ya tiene un sensor de ese tipo.',
        );
      throw error;
    }
  }
}
