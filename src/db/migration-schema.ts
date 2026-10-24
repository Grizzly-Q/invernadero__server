import type { QueryRunner } from 'typeorm';

/**
 * Obtiene el esquema escapado para migrar public o un esquema aislado de pruebas.
 * @param queryRunner Conexión PostgreSQL utilizada por la migración.
 * @returns Identificador SQL escapado, nunca un fragmento proporcionado por el cliente HTTP.
 * @throws Error si se intenta ejecutar con un motor diferente a PostgreSQL.
 */
export function migrationSchema(queryRunner: QueryRunner): string {
  const options = queryRunner.connection.options;
  if (options.type !== 'postgres') {
    throw new Error('Estas migraciones requieren PostgreSQL.');
  }
  return queryRunner.connection.driver.escape(options.schema ?? 'public');
}
