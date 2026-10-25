import { join } from 'node:path';
import type { DataSourceOptions } from 'typeorm';
import { ControllerEntity } from '../controllers/entities/controller.entity';
import { ControllerCredentialEntity } from '../controllers/entities/controller-credential.entity';
import { UserSessionEntity } from '../auth/entities/user-session.entity';
import { UserAccountEntity } from '../users/entities/user-account.entity';
import { SensorEntity } from '../telemetry/entities/sensor.entity';
import { MeasurementEntity } from '../telemetry/entities/measurement.entity';
import { GreenhouseEntity } from './entities/greenhouse.entity';

/**
 * Comparte el modelo y las migraciones entre Nest y la CLI sin abrir conexiones.
 * @param url Cadena PostgreSQL; nunca debe registrarse en logs.
 * @returns Opciones sin sincronización ni ejecución automática de migraciones.
 */
export function databaseOptions(
  url: string,
): Extract<DataSourceOptions, { type: 'postgres' }> {
  return {
    type: 'postgres',
    url,
    schema: 'public',
    entities: [
      GreenhouseEntity,
      ControllerEntity,
      ControllerCredentialEntity,
      UserSessionEntity,
      UserAccountEntity,
      SensorEntity,
      MeasurementEntity,
    ],
    migrations: [join(__dirname, 'migrations', '*{.js,.ts}')],
    migrationsTableName: 'typeorm_migrations',
    migrationsTransactionMode: 'all',
    migrationsRun: false,
    synchronize: false,
    poolSize: 3,
    connectTimeoutMS: 10000,
    // Conserva la configuración existente; la validación del certificado sigue pendiente.
    ssl: { rejectUnauthorized: false },
  };
}
