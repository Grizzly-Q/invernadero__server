import { BadRequestException } from '@nestjs/common';
import type { SensorEntity } from './entities/sensor.entity';
import type { SensorReadingDto } from './dto/receive-telemetry.dto';

/** Comparte validación física y de fechas entre la telemetría histórica y las lecturas en vivo. */
export function validateSensorReading(
  sensor: SensorEntity,
  reading: SensorReadingDto,
): Date | null {
  if (
    ((sensor.type.startsWith('Humedad') || sensor.unit === '%') &&
      (reading.value < 0 || reading.value > 100)) ||
    (sensor.type !== 'Temperatura' && reading.value < 0)
  )
    throw new BadRequestException(
      'Los porcentajes de humedad y nivel deben estar entre 0 y 100.',
    );
  const measuredAt = reading.measuredAt ? new Date(reading.measuredAt) : null;
  if (measuredAt && measuredAt.getTime() > Date.now() + 300000)
    throw new BadRequestException(
      'La hora de medición no puede adelantarse más de cinco minutos al servidor.',
    );
  return measuredAt;
}
