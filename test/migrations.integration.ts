import 'reflect-metadata';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { DataSource, MigrationExecutor } from 'typeorm';
import type { QueryRunner } from 'typeorm';
import { createBaseline } from './helpers/baseline';
import { databaseOptions } from '../src/db/database-options';
import { AdaptarMedicion1792771200003 } from '../src/db/migrations/1792771200003-AdaptarMedicion';
import { ControllerEntity } from '../src/controllers/entities/controller.entity';
import { MeasurementEntity } from '../src/telemetry/entities/measurement.entity';

/**
 * Comprueba una restricción sin abortar la transacción que contiene todas las pruebas.
 * @param runner Conexión con una transacción activa.
 * @param operation Operación que debe ser rechazada por PostgreSQL.
 * @param expected Patrón que identifica el error esperado.
 */
async function rejectsWithSavepoint(
  runner: QueryRunner,
  operation: () => Promise<unknown>,
  expected: RegExp,
): Promise<void> {
  await runner.startTransaction();
  try {
    await assert.rejects(operation, expected);
  } finally {
    await runner.rollbackTransaction();
  }
}

/**
 * Recrea únicamente estructura y datos ficticios en un esquema aleatorio.
 * Todos los cambios se revierten, incluso si una comprobación falla.
 * @throws Error si falta MIGRATION_TEST_DATABASE_URL o una comprobación no se cumple.
 */
async function main(): Promise<void> {
  const url = process.env.MIGRATION_TEST_DATABASE_URL;
  if (!url)
    throw new Error(
      'Configure MIGRATION_TEST_DATABASE_URL para las pruebas de integración.',
    );
  const schemaName = `prueba_migraciones_${randomBytes(8).toString('hex')}`;
  const source = new DataSource({
    ...databaseOptions(url),
    schema: schemaName,
    logging: false,
  });
  await source.initialize();
  const runner = source.createQueryRunner();
  const quote = (name: string) => source.driver.escape(name);
  const schema = quote(schemaName);
  try {
    await runner.startTransaction();
    await runner.query("SET LOCAL statement_timeout = '30s'");
    await createBaseline(runner, schemaName);

    const greenhouseId = '9007199254740993';
    const controllerId = '9007199254740994';
    const sensorId = '9007199254740995';
    await runner.query(
      `INSERT INTO ${schema}."Invernadero" ("idInvernadero_Invernadero", "nombre_Invernadero", ubicacion, largo, ancho) VALUES ($1, 'Prueba', 'Prueba', 1, 1)`,
      [greenhouseId],
    );
    await runner.query(
      `INSERT INTO ${schema}."Controlador" ("idControlador_Controlador", "idInvernadero_Controlador") VALUES ($1, $2)`,
      [controllerId, greenhouseId],
    );
    await runner.query(
      `INSERT INTO ${schema}."Sensor" ("idSensor_Sensor", "idControlador_Sensor", "tipoSensor", "unidadMedida") VALUES ($1, $2, 'HumedadSuelo', '%')`,
      [sensorId, controllerId],
    );
    await runner.query(
      `INSERT INTO ${schema}."Medicion" ("idSensor_Medicion", "fechaHora", valor) VALUES ($1, '2026-10-23 10:30:00', 48.50)`,
      [sensorId],
    );

    const executor = new MigrationExecutor(source, runner);
    const executed = await executor.executePendingMigrations();
    assert.equal(executed.length, source.migrations.length);
    assert.equal(
      (await executor.executePendingMigrations()).length,
      0,
      'La segunda ejecución no debe repetir migraciones.',
    );
    const measurement = await runner.manager
      .getRepository(MeasurementEntity)
      .findOneByOrFail({ sensorId });
    assert.equal(
      measurement.measuredAt?.toISOString(),
      '2026-10-23T15:30:00.000Z',
    );
    assert.equal(measurement.receivedAt, null);
    assert.equal(measurement.value, '48.50');
    assert.match(measurement.readingId, /^historica:/);
    const controller = await runner.manager
      .getRepository(ControllerEntity)
      .findOneByOrFail({ id: controllerId });
    assert.equal(
      controller.id,
      controllerId,
      'Los bigint no deben perder precisión.',
    );
    assert.equal(controller.active, false);
    assert.equal(controller.createdAt, null);

    await rejectsWithSavepoint(
      runner,
      () =>
        runner.query(
          `INSERT INTO ${schema}."Medicion" ("idSensor_Medicion", "idLectura_Medicion", valor) VALUES ($1, $2, 50)`,
          [sensorId, measurement.readingId],
        ),
      /UQ_Medicion_Sensor_Lectura/,
    );
    await runner.query(
      `INSERT INTO ${schema}."Medicion" ("idSensor_Medicion", "idLectura_Medicion", valor) VALUES ($1, 'sin-reloj', 51)`,
      [sensorId],
    );
    const withoutClock = await runner.manager
      .getRepository(MeasurementEntity)
      .findOneByOrFail({ sensorId, readingId: 'sin-reloj' });
    assert.equal(withoutClock.measuredAt, null);
    assert.ok(withoutClock.receivedAt instanceof Date);
    const migration = new AdaptarMedicion1792771200003();
    await rejectsWithSavepoint(
      runner,
      () => migration.down(runner),
      /sin hora de medición/,
    );
    await runner.query(
      `DELETE FROM ${schema}."Medicion" WHERE "idLectura_Medicion" = 'sin-reloj'`,
    );
    await runner.query(
      `INSERT INTO ${schema}."Medicion" ("idSensor_Medicion", "idLectura_Medicion", "medidoEn_Medicion", valor) VALUES ($1, 'mismo-instante', '2026-10-23T15:30:00Z', 52)`,
      [sensorId],
    );
    await rejectsWithSavepoint(
      runner,
      () => migration.down(runner),
      /sensor y hora repetidos/,
    );
    await runner.query(
      `DELETE FROM ${schema}."Medicion" WHERE "idLectura_Medicion" = 'mismo-instante'`,
    );

    const validHash = 'a'.repeat(64);
    await runner.query(
      `INSERT INTO ${schema}."CredencialControlador" ("idControlador_CredencialControlador", "hashCredencial_CredencialControlador") VALUES ($1, $2)`,
      [controllerId, validHash],
    );
    await rejectsWithSavepoint(
      runner,
      () =>
        runner.query(
          `INSERT INTO ${schema}."CredencialControlador" ("idControlador_CredencialControlador", "hashCredencial_CredencialControlador") VALUES ($1, $2)`,
          [controllerId, validHash],
        ),
      /UQ_CredencialControlador_Hash/,
    );
    await rejectsWithSavepoint(
      runner,
      () =>
        runner.query(
          `INSERT INTO ${schema}."CredencialControlador" ("idControlador_CredencialControlador", "hashCredencial_CredencialControlador") VALUES ($1, 'no-es-un-hash')`,
          [controllerId],
        ),
      /CK_CredencialControlador_Hash/,
    );
    await rejectsWithSavepoint(
      runner,
      () =>
        runner.query(
          `INSERT INTO ${schema}."CredencialControlador" ("idControlador_CredencialControlador", "hashCredencial_CredencialControlador", "fechaExpiracion_CredencialControlador") VALUES ($1, $2, '2000-01-01T00:00:00Z')`,
          [controllerId, 'b'.repeat(64)],
        ),
      /CK_CredencialControlador_Expiracion/,
    );
    const security = (await runner.query(
      `SELECT relname AS tabla, relrowsecurity AS rls FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace WHERE n.nspname=$1 AND relname IN ('CredencialControlador', 'typeorm_migrations')`,
      [schemaName],
    )) as Array<{ tabla: string; rls: boolean }>;
    assert.equal(security.length, 2);
    assert.ok(security.every((item) => item.rls));
    const grants = (await runner.query(
      `SELECT count(*)::text AS total FROM information_schema.role_table_grants WHERE table_schema=$1 AND table_name IN ('CredencialControlador','typeorm_migrations') AND grantee IN ('anon','authenticated','PUBLIC')`,
      [schemaName],
    )) as Array<{ total: string }>;
    assert.equal(grants[0].total, '0');

    for (let index = 0; index < source.migrations.length; index++)
      await executor.undoLastMigration();
    const restored = (await runner.query(
      `SELECT to_char("fechaHora", 'YYYY-MM-DD HH24:MI:SS') AS fecha, valor::text AS valor FROM ${schema}."Medicion"`,
    )) as Array<{ fecha: string; valor: string }>;
    assert.deepEqual(restored, [
      { fecha: '2026-10-23 10:30:00', valor: '48.50' },
    ]);
    assert.equal((await executor.getExecutedMigrations()).length, 0);
    assert.equal(
      (await executor.executePendingMigrations()).length,
      source.migrations.length,
    );
    console.log(
      'Migraciones verificadas: historial, idempotencia, fechas, bigint, duplicados, credenciales, RLS y reversión.',
    );
  } finally {
    if (runner.isTransactionActive) await runner.rollbackTransaction();
    await runner.release();
    await source.destroy();
  }
}

void main().catch((error: unknown) => {
  // No se imprimen objetos de conexión ni parámetros SQL que puedan contener secretos.
  console.error(
    error instanceof Error ? error.message : 'Falló la prueba de migraciones.',
  );
  process.exitCode = 1;
});
