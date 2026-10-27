import type { MigrationInterface, QueryRunner } from 'typeorm';
import { migrationSchema } from '../migration-schema';

/** Amplía los tipos sin reinterpretar sensores ni mediciones de humedad existentes. */
export class AdmitirTemperatura1792771200011 implements MigrationInterface {
  /** Agrega temperatura al CHECK; conserva los identificadores y el historial. */
  async up(runner: QueryRunner): Promise<void> {
    const schema = migrationSchema(runner);
    await runner.query(
      `ALTER TABLE ${schema}."Sensor" DROP CONSTRAINT "CK_Sensor_Tipo", ADD CONSTRAINT "CK_Sensor_Tipo" CHECK ("tipoSensor" IN ('HumedadAmbiental', 'HumedadSuelo', 'NivelAgua', 'Temperatura'))`,
    );
  }
  /** Rechaza la reversión si existen sensores de temperatura para evitar pérdida de datos. */
  async down(runner: QueryRunner): Promise<void> {
    const schema = migrationSchema(runner);
    await runner.query(
      `ALTER TABLE ${schema}."Sensor" DROP CONSTRAINT "CK_Sensor_Tipo", ADD CONSTRAINT "CK_Sensor_Tipo" CHECK ("tipoSensor" IN ('HumedadAmbiental', 'HumedadSuelo', 'NivelAgua'))`,
    );
  }
}
