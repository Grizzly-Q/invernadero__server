import { Transform } from 'class-transformer';
import {
  IsNumber,
  IsIn,
  IsOptional,
  IsString,
  Length,
  Max,
  Min,
  ValidateIf,
} from 'class-validator';

/** Datos públicos para crear un invernadero; el propietario se obtiene de la sesión y no del JSON. */
export class CreateGreenhouseDto {
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @Length(1, 100)
  name!: string;

  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @Length(1, 200)
  location!: string;

  @IsNumber({ maxDecimalPlaces: 2 }) @Min(0.01) @Max(999999.99) length!: number;
  @IsNumber({ maxDecimalPlaces: 2 }) @Min(0.01) @Max(999999.99) width!: number;
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  @Max(999999.99)
  height?: number;
  @IsOptional() @IsString() @Length(0, 500) description?: string;
}

/** Edición parcial: omitir conserva el dato; null solo elimina alto o descripción. No admite estado, modo ni propietarios. */
export class UpdateGreenhouseDto {
  @ValidateIf((_object: unknown, value: unknown) => value !== undefined)
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @Length(1, 100)
  name?: string;

  @ValidateIf((_object: unknown, value: unknown) => value !== undefined)
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @Length(1, 200)
  location?: string;

  @ValidateIf((_object: unknown, value: unknown) => value !== undefined)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  @Max(999999.99)
  length?: number;

  @ValidateIf((_object: unknown, value: unknown) => value !== undefined)
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  @Max(999999.99)
  width?: number;

  @ValidateIf(
    (_object: unknown, value: unknown) => value !== undefined && value !== null,
  )
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0.01)
  @Max(999999.99)
  height?: number | null;

  @ValidateIf(
    (_object: unknown, value: unknown) => value !== undefined && value !== null,
  )
  @IsString()
  @Length(0, 500)
  description?: string | null;
}

/** Transición administrativa explícita; desactivar conserva los registros y bloquea las comunicaciones del equipo. */
export class GreenhouseStatusDto {
  @IsIn(['Activo', 'EnMantenimiento', 'Desactivado'])
  status!: 'Activo' | 'EnMantenimiento' | 'Desactivado';
}
