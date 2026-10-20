import type { ConfigService } from '@nestjs/config';
import type { TypeOrmModuleOptions } from '@nestjs/typeorm';

/**
 * Construye las opciones de conexión PostgreSQL utilizadas por TypeORM.
 * @param config Servicio con las variables de entorno previamente validadas.
 * @returns Opciones de conexión; esta función no abre conexiones ni ejecuta consultas.
 * @throws TypeError si DATABASE_URL no está definida en el servicio de configuración.
 */
export function dbConfig(config: ConfigService): TypeOrmModuleOptions {
  return {
    type: 'postgres',
    url: config.getOrThrow<string>('DATABASE_URL'),
    // Incluye las entidades registradas mediante TypeOrmModule.forFeature().
    autoLoadEntities: true,
    // Evita cambios automáticos en la estructura de las tablas existentes.
    synchronize: false,
    poolSize: 3,
    // Cifra la conexión; la validación del certificado permanece deshabilitada.
    ssl: { rejectUnauthorized: false },
  };
}
