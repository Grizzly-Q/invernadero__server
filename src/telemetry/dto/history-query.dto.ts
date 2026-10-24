import { Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsISO8601,
  IsOptional,
  Matches,
  Max,
  Min,
} from 'class-validator';

/** Filtros del historial; las fechas explícitas deben incluir zona horaria. */
export class HistoryQueryDto {
  @IsOptional()
  @IsIn(['day', 'week'])
  period?: 'day' | 'week';

  @IsOptional()
  @IsISO8601({ strict: true })
  @Matches(/T.*(?:Z|[+-]\d{2}:\d{2})$/)
  from?: string;

  @IsOptional()
  @IsISO8601({ strict: true })
  @Matches(/T.*(?:Z|[+-]\d{2}:\d{2})$/)
  to?: string;

  @IsOptional()
  @IsIn(['none', 'hour'])
  groupBy: 'none' | 'hour' = 'none';

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(10000)
  page = 1;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(500)
  limit = 100;
}
