import { randomBytes } from 'node:crypto';
import { DataSource } from 'typeorm';
import { databaseOptions } from '../../src/db/database-options';
import { createBaseline } from './baseline';

/** Construye una base aislada para las pruebas HTTP; nunca toma DATABASE_URL de desarrollo. */
export async function authDatabase(
  url: string,
): Promise<{ source: DataSource; schema: string }> {
  const schema = `prueba_auth_${randomBytes(8).toString('hex')}`;
  const source = new DataSource({ ...databaseOptions(url), schema });
  await source.initialize();
  const runner = source.createQueryRunner();
  try {
    await runner.startTransaction();
    await createBaseline(runner, schema);
    await runner.commitTransaction();
    await source.runMigrations();
    return { source, schema };
  } catch (error) {
    if (runner.isTransactionActive) await runner.rollbackTransaction();
    await source.query(
      `DROP SCHEMA IF EXISTS ${source.driver.escape(schema)} CASCADE`,
    );
    await source.destroy();
    throw error;
  } finally {
    if (!runner.isReleased) await runner.release();
  }
}
