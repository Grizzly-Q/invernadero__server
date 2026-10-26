import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  ArrayMinSize,
  IsArray,
  IsISO8601,
  IsNumber,
  IsOptional,
  Matches,
  Max,
  Min,
  ValidateNested,
} from 'class-validator';
import { IsDatabaseId } from '../../db/database-id';

/** Una lectura identificable después de reinicios; la recepción la fecha siempre el servidor. */
export class SensorReadingDto {
  @IsDatabaseId()
  sensorId!: string;

  @Matches(/^(?!historica:)[A-Za-z0-9][A-Za-z0-9:_-]{0,99}$/, {
    message:
      'readingId debe tener entre 1 y 100 caracteres alfanuméricos, guiones o dos puntos; historica: está reservado.',
  })
  readingId!: string;

  @IsOptional()
  @IsISO8601({ strict: true, strictSeparator: true })
  @Matches(/(?:Z|[+-]\d{2}:\d{2})$/i)
  measuredAt?: string | null;

  @IsNumber({ allowInfinity: false, allowNaN: false, maxDecimalPlaces: 2 })
  @Min(-273.15)
  @Max(99999.99)
  value!: number;
}

/** Lote acotado y atómico: cualquier lectura inválida rechaza el envío completo. */
export class ReceiveTelemetryDto {
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => SensorReadingDto)
  readings!: SensorReadingDto[];
}
