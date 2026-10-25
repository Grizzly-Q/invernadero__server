import { plainToInstance } from 'class-transformer';
import {
  IsByteLength,
  IsBase64,
  IsString,
  IsUrl,
  Matches,
  validateSync,
} from 'class-validator';

/** Reglas de las dos variables obligatorias; las opciones adicionales se conservan. */
class EnvironmentVariables {
  @IsUrl(
    {
      protocols: ['postgres', 'postgresql'],
      require_protocol: true,
      require_tld: false,
    },
    {
      message:
        'DATABASE_URL debe ser una URL PostgreSQL con un servidor válido.',
    },
  )
  // IsUrl valida el servidor; esta regla exige también el nombre de la base.
  @Matches(/^postgres(?:ql)?:\/\/[^/?#\s]+\/[^?#\s]+(?:[?#]\S*)?$/i, {
    message: 'DATABASE_URL debe incluir el nombre de la base de datos.',
  })
  DATABASE_URL?: string;

  @IsString({ message: 'JWT_SECRET debe ser una cadena de texto.' })
  @IsByteLength(32, undefined, {
    message: 'JWT_SECRET debe contener al menos 32 bytes.',
  })
  @Matches(/\S/, {
    message: 'JWT_SECRET no puede estar vacío ni contener únicamente espacios.',
  })
  JWT_SECRET?: string;

  @IsBase64({
    message: 'TOKEN_ENCRYPTION_KEY debe ser una cadena Base64 válida.',
  })
  TOKEN_ENCRYPTION_KEY?: string;
}

/**
 * Valida el entorno combinado por ConfigModule antes de crear los servicios.
 * @param environment Variables del archivo .env y del proceso, con prioridad del proceso.
 * @returns Las variables originales, sin modificar credenciales ni descartar opciones.
 * @throws Error si el secreto JWT o la URL PostgreSQL son inválidos; no expone valores.
 */
export function validateEnvironment(
  environment: Record<string, string | undefined>,
): Record<string, string | undefined> {
  const variables = plainToInstance(EnvironmentVariables, environment);
  const errors = validateSync(variables, {
    skipMissingProperties: false,
    validationError: { target: false, value: false },
  });

  if (errors.length > 0) {
    const messages = errors.flatMap((error) =>
      Object.values(error.constraints ?? {}),
    );
    throw new Error(messages.join('\n'));
  }

  return environment;
}
