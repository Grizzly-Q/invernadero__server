import { BadRequestException, Injectable } from '@nestjs/common';
import type { PipeTransform } from '@nestjs/common';
import { ValidateBy } from 'class-validator';
import type { ValidationOptions } from 'class-validator';

/** Comprueba un bigint positivo canónico sin convertirlo a Number ni perder precisión. */
export function isDatabaseId(value: unknown): value is string {
  return (
    typeof value === 'string' &&
    /^[1-9]\d{0,18}$/.test(value) &&
    BigInt(value) <= 9223372036854775807n
  );
}

/** Valida identificadores PostgreSQL en DTOs; el JSON debe enviarlos como cadenas. */
export function IsDatabaseId(options?: ValidationOptions): PropertyDecorator {
  return ValidateBy(
    {
      name: 'isDatabaseId',
      validator: {
        validate: isDatabaseId,
        defaultMessage: () =>
          'El identificador debe ser una cadena bigint positiva válida.',
      },
    },
    options,
  );
}

/** Rechaza parámetros de ruta que PostgreSQL no puede representar como bigint positivo. */
@Injectable()
export class DatabaseIdPipe implements PipeTransform<string, string> {
  /** Devuelve el identificador intacto; produce 400 si su formato o rango es inválido. */
  transform(value: string): string {
    if (!isDatabaseId(value))
      throw new BadRequestException('Identificador inválido.');
    return value;
  }
}
