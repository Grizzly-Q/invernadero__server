import { BadRequestException } from '@nestjs/common';
import type { SensorEntity } from '../telemetry/entities/sensor.entity';

/** Unidad canónica del tipo; rechaza unidades incompatibles sin convertir mediciones. */
export function sensorUnit(
  type: SensorEntity['type'],
  supplied?: string,
): string {
  const unit = type === 'Temperatura' ? '°C' : '%';
  if (supplied !== undefined && supplied !== unit)
    throw new BadRequestException(`La unidad de ${type} debe ser ${unit}.`);
  return unit;
}
