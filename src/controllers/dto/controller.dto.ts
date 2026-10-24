import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsIn,
  IsISO8601,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
  MinLength,
  ValidateIf,
} from 'class-validator';
import { IsDatabaseId } from '../../db/database-id';
import type { SensorEntity } from '../../telemetry/entities/sensor.entity';

/** Cuerpo de registro de un controlador ESP32; el servidor genera su id y lo crea desactivado. */
export class CreateControllerDto {
  /** Identificador del invernadero existente, como cadena bigint positiva; ejemplo: "1". */
  @IsDatabaseId()
  greenhouseId!: string;

  /** Nombre del controlador ESP32: de 1 a 100 caracteres después de recortar espacios exteriores. */
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  name!: string;
}

/** Cuerpo de activación o bloqueo del controlador ESP32; no modifica su invernadero. */
export class ControllerStatusDto {
  /** true autoriza el uso de credenciales vigentes; false bloquea todas sin revocarlas. */
  @IsBoolean()
  active!: boolean;
}

/** Vencimiento opcional en ISO 8601 con zona explícita; omitir o usar null significa sin vencimiento. */
export class IssueControllerCredentialDto {
  /** Fecha futura con Z o desfase explícito; el servicio verifica que sea posterior a la hora del servidor. */
  @IsOptional()
  @IsISO8601({ strict: true, strictSeparator: true })
  @Matches(/(?:Z|[+-]\d{2}:\d{2})$/i)
  expiresAt?: string | null;
}

/** Consulta paginada de controladores ESP32 o de metadatos de credenciales; no consulta mediciones. */
export class ControllerPageDto {
  /** Cursor exclusivo: solo IDs menores; se obtiene de nextBeforeId en la respuesta anterior. */
  @ValidateIf((_object: unknown, value: unknown) => value !== undefined)
  @IsDatabaseId()
  beforeId?: string;
}

/** Registra un tipo de sensor admitido por el esquema sin aceptar su identificador del cliente. */
export class CreateSensorDto {
  /** Tipo admitido por PostgreSQL; actualmente solo puede registrarse uno de cada tipo por controlador ESP32. */
  @IsIn(['HumedadAmbiental', 'HumedadSuelo', 'NivelAgua'])
  type!: SensorEntity['type'];

  /** Unidad de los valores enviados: de 1 a 10 caracteres, por ejemplo % o cm; no realiza conversiones. */
  @Transform(({ value }: { value: unknown }) =>
    typeof value === 'string' ? value.trim() : value,
  )
  @IsString()
  @MinLength(1)
  @MaxLength(10)
  unit!: string;
}
