import type { MigrationInterface, QueryRunner } from 'typeorm';
import { migrationSchema } from '../migration-schema';

/** Persiste cuentas de login de la API sin modificar public.Usuario. */
export class CrearCuentaAcceso1792771200006 implements MigrationInterface {
  async up(queryRunner: QueryRunner): Promise<void> {
    const schema = migrationSchema(queryRunner);
    await queryRunner.query(`CREATE TABLE ${schema}."CuentaAcceso" (
      "idCuenta_CuentaAcceso" uuid NOT NULL,
      "nombre_CuentaAcceso" varchar(80) NOT NULL,
      "correo_CuentaAcceso" varchar(254) NOT NULL,
      "hashContrasena_CuentaAcceso" varchar(255) NOT NULL,
      "rol_CuentaAcceso" varchar(20) NOT NULL DEFAULT 'OPERATOR',
      "fechaCreacion_CuentaAcceso" timestamptz NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "PK_CuentaAcceso" PRIMARY KEY ("idCuenta_CuentaAcceso"),
      CONSTRAINT "UQ_CuentaAcceso_Correo" UNIQUE ("correo_CuentaAcceso"),
      CONSTRAINT "CK_CuentaAcceso_Rol" CHECK ("rol_CuentaAcceso" IN ('ADMIN', 'OPERATOR'))
    )`);
    await queryRunner.query(
      `ALTER TABLE ${schema}."CuentaAcceso" ENABLE ROW LEVEL SECURITY`,
    );
    await queryRunner.query(
      `REVOKE ALL ON TABLE ${schema}."CuentaAcceso" FROM PUBLIC`,
    );
    await queryRunner.query(`DO $$ BEGIN
      IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
        REVOKE ALL ON TABLE ${schema}."CuentaAcceso" FROM anon;
      END IF;
      IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
        REVOKE ALL ON TABLE ${schema}."CuentaAcceso" FROM authenticated;
      END IF;
    END $$`);
  }

  async down(queryRunner: QueryRunner): Promise<void> {
    const schema = migrationSchema(queryRunner);
    await queryRunner.query(`DROP TABLE ${schema}."CuentaAcceso"`);
  }
}
