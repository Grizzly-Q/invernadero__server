import {
  Equals,
  IsBoolean,
  IsInt,
  IsOptional,
  IsUUID,
  Max,
  Min,
  ValidateIf,
} from 'class-validator';
import { IsDatabaseId } from '../../db/database-id';
import { SensorReadingDto } from '../dto/receive-telemetry.dto';

/** Petición del usuario; la duración de la concesión la fija el servidor. */
export class StartMonitoringDto {
  @IsDatabaseId()
  sensorId!: string;

  @IsOptional()
  @IsInt()
  @Min(1000)
  @Max(10000)
  intervalMs?: number;
}

/** Renueva o detiene únicamente la suscripción de la conexión que llama. */
export class SensorSubscriptionDto {
  @IsDatabaseId()
  sensorId!: string;
}

/** Confirmación de la frecuencia que el firmware realmente puede aplicar. */
export class MonitoringAckDto extends SensorSubscriptionDto {
  @Equals('monitoring.ack')
  type!: 'monitoring.ack';

  @IsUUID('4')
  requestId!: string;

  @IsBoolean()
  accepted!: boolean;

  @ValidateIf((message: MonitoringAckDto) => message.accepted)
  @IsInt()
  @Min(1000)
  @Max(30000)
  intervalMs?: number;
}

/** Lectura rápida correlacionada con una orden confirmada; no se inserta en el historial. */
export class LiveReadingDto extends SensorReadingDto {
  @Equals('monitoring.reading')
  type!: 'monitoring.reading';

  @IsUUID('4')
  requestId!: string;

  @IsInt()
  @Min(0)
  @Max(2147483647)
  sequence!: number;
}

/** Asociación realizada por un administrador entre una cuenta temporal y Usuario de PostgreSQL. */
export class LinkMonitoringUserDto {
  @IsDatabaseId()
  databaseUserId!: string;
}
