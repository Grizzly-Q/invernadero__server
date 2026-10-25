import { Injectable, NotFoundException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import type { PublicUser } from '../../users/user.types';
import { GreenhouseAccessService } from '../../greenhouses/greenhouse-access.service';
import { SensorEntity } from '../entities/sensor.entity';

/** Autoriza historial y monitoreo mediante la pertenencia persistida, sin vínculos temporales ni acceso global. */
@Injectable()
export class MonitoringAccessService {
  constructor(
    private readonly source: DataSource,
    private readonly access: GreenhouseAccessService,
  ) {}

  /** Devuelve el sensor para un miembro de su invernadero; rechaza no miembros con 403 y sensores inexistentes con 404. */
  async sensor(user: PublicUser, sensorId: string): Promise<SensorEntity> {
    const sensor = await this.source
      .getRepository(SensorEntity)
      .findOne({ where: { id: sensorId }, relations: { controller: true } });
    if (!sensor) throw new NotFoundException('Sensor no encontrado.');
    await this.access.require(user.id, sensor.controller.greenhouseId);
    return sensor;
  }
}
