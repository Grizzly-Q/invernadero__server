import type { MigrationInterface, QueryRunner } from 'typeorm';
import { migrationSchema } from '../migration-schema';

/** Persiste las sesiones para validarlas y revocarlas entre instancias. */
export class CrearSesionUsuario1792771200005 implements MigrationInterface {
  /** Almacena el JWT cifrado con AES-256-GCM y metadatos de sesión. */
  async up(queryRunner: QueryRunner): Promise<void> {
    const schema = migrationSchema(queryRunner);
    await queryRunner.query(`CREATE TABLE ${schema}."SesionUsuario" (
      "idSesion_SesionUsuario" uuid NOT NULL,
      "idUsuario_SesionUsuario" uuid NOT NULL,
      "tokenCifrado_SesionUsuario" text NOT NULL,
      "fechaExpiracion_SesionUsuario" timestamptz NOT NULL,
      CONSTRAINT "PK_SesionUsuario" PRIMARY KEY ("idSesion_SesionUsuario")
    )`);
    await queryRunner.query(`CREATE INDEX "IX_SesionUsuario_Expiracion"
      ON ${schema}."SesionUsuario" ("fechaExpiracion_SesionUsuario")`);
    await queryRunner.query(
      `ALTER TABLE ${schema}."SesionUsuario" ENABLE ROW LEVEL SECURITY`,
    );
    await queryRunner.query(
      `REVOKE ALL ON TABLE ${schema}."SesionUsuario" FROM PUBLIC`,
    );
    await queryRunner.query(`DO $$ BEGIN
      IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
        REVOKE ALL ON TABLE ${schema}."SesionUsuario" FROM anon;
      END IF;
      IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
        REVOKE ALL ON TABLE ${schema}."SesionUsuario" FROM authenticated;
      END IF;
    END $$`);
  }

  /** Elimina todas las sesiones persistidas. */
  async down(queryRunner: QueryRunner): Promise<void> {
    const schema = migrationSchema(queryRunner);
    await queryRunner.query(`DROP TABLE ${schema}."SesionUsuario"`);
  }
}
