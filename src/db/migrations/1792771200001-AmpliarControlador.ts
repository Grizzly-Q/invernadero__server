import type { MigrationInterface, QueryRunner } from 'typeorm';
import { migrationSchema } from '../migration-schema';

/** Incorpora datos administrativos sin confundir autorización con conectividad. */
export class AmpliarControlador1792771200001 implements MigrationInterface {
  /** Conserva equipos existentes, desactivados hasta que se aprovisionen sus credenciales. */
  async up(queryRunner: QueryRunner): Promise<void> {
    const schema = migrationSchema(queryRunner);
    await queryRunner.query(`ALTER TABLE ${schema}."Controlador"
      ADD COLUMN "nombre_Controlador" varchar(100),
      ADD COLUMN "activo_Controlador" boolean NOT NULL DEFAULT false,
      ADD COLUMN "fechaCreacion_Controlador" timestamptz,
      ADD COLUMN "ultimaComunicacionEn_Controlador" timestamptz`);
    await queryRunner.query(`UPDATE ${schema}."Controlador"
      SET "nombre_Controlador" = 'ESP32 ' || "idControlador_Controlador"::text`);
    // Las fechas históricas siguen nulas; el valor por defecto se aplica a futuros registros.
    await queryRunner.query(`ALTER TABLE ${schema}."Controlador"
      ALTER COLUMN "nombre_Controlador" SET NOT NULL,
      ALTER COLUMN "fechaCreacion_Controlador" SET DEFAULT CURRENT_TIMESTAMP`);
  }

  /** Elimina los campos nuevos; sus valores administrativos no pueden recuperarse después. */
  async down(queryRunner: QueryRunner): Promise<void> {
    const schema = migrationSchema(queryRunner);
    await queryRunner.query(`ALTER TABLE ${schema}."Controlador"
      DROP COLUMN "ultimaComunicacionEn_Controlador",
      DROP COLUMN "fechaCreacion_Controlador",
      DROP COLUMN "activo_Controlador",
      DROP COLUMN "nombre_Controlador"`);
  }
}
