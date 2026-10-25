import { Transform } from 'class-transformer';
import {
  IsNumber,
  IsOptional,
  IsString,
  Length,
  Max,
  Min,
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
