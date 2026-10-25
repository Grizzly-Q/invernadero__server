import type { MigrationInterface, QueryRunner } from 'typeorm';
import { migrationSchema } from '../migration-schema';

/** Conserva cuentas, relaciones bigint y sesiones cifradas históricas al introducir refresh persistente. */
export class PersistirCuentasYRefresh1792771200008 implements MigrationInterface {
  /** Archiva la tabla de sesiones anterior sin borrar sus filas y crea la nueva estructura con clave foránea. */
  async up(runner: QueryRunner): Promise<void> {
    const schema = migrationSchema(runner);
    await runner.query(`ALTER TABLE ${schema}."Usuario"
      ADD COLUMN "uuid_Usuario" uuid NOT NULL DEFAULT gen_random_uuid(),
      ADD COLUMN "correo_Usuario" varchar(254),
      ADD CONSTRAINT "UQ_Usuario_UUID" UNIQUE ("uuid_Usuario"),
      ADD CONSTRAINT "UQ_Usuario_Correo" UNIQUE ("correo_Usuario"),
      ADD CONSTRAINT "CK_Usuario_CorreoNormalizado" CHECK ("correo_Usuario" IS NULL OR ("correo_Usuario" = lower(btrim("correo_Usuario")) AND "correo_Usuario" <> ''))`);
    // El nombre visible no es una credencial; diferentes personas pueden compartirlo.
    await runner.query(
      `ALTER TABLE ${schema}."Usuario" DROP CONSTRAINT "Usuario_nombreUsuario_key"`,
    );
    await runner.query(
      `ALTER TABLE ${schema}."SesionUsuario" RENAME TO "SesionUsuarioLegado"`,
    );
    await runner.query(`CREATE TABLE ${schema}."SesionUsuario" (
      "idSesion_SesionUsuario" uuid NOT NULL,
      "idUsuario_SesionUsuario" uuid NOT NULL,
      "hashRefresh_SesionUsuario" varchar(64) NOT NULL,
      "fechaExpiracion_SesionUsuario" timestamptz NOT NULL,
      "fechaRevocacion_SesionUsuario" timestamptz,
      CONSTRAINT "PK_SesionUsuario_Refresh" PRIMARY KEY ("idSesion_SesionUsuario"),
      CONSTRAINT "FK_SesionUsuario_Usuario" FOREIGN KEY ("idUsuario_SesionUsuario") REFERENCES ${schema}."Usuario" ("uuid_Usuario") ON DELETE CASCADE
    )`);
    await runner.query(
      `CREATE INDEX "IX_SesionUsuarioRefresh_Expiracion" ON ${schema}."SesionUsuario" ("fechaExpiracion_SesionUsuario")`,
    );
    await runner.query(
      `CREATE INDEX "IX_SesionUsuario_Usuario" ON ${schema}."SesionUsuario" ("idUsuario_SesionUsuario")`,
    );
    await runner.query(
      `ALTER TABLE ${schema}."SesionUsuario" ENABLE ROW LEVEL SECURITY`,
    );
    await runner.query(
      `REVOKE ALL ON TABLE ${schema}."SesionUsuario" FROM PUBLIC`,
    );
    await runner.query(`DO $$ BEGIN
      IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN REVOKE ALL ON TABLE ${schema}."SesionUsuario" FROM anon; END IF;
      IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN REVOKE ALL ON TABLE ${schema}."SesionUsuario" FROM authenticated; END IF;
    END $$`);
  }

  /** Restaura las sesiones históricas; rechaza la reversión si existen sesiones nuevas para evitar perderlas. */
  async down(runner: QueryRunner): Promise<void> {
    const schema = migrationSchema(runner);
    const sessions = (await runner.query(
      `SELECT count(*)::text AS total FROM ${schema}."SesionUsuario"`,
    )) as Array<{ total: string }>;
    if (sessions[0].total !== '0')
      throw new Error(
        'No se puede revertir mientras existan sesiones de renovación; deben resolverse antes sin perder sus datos.',
      );
    await runner.query(
      `ALTER TABLE ${schema}."Usuario" ADD CONSTRAINT "Usuario_nombreUsuario_key" UNIQUE ("nombreUsuario")`,
    );
    await runner.query(`DROP TABLE ${schema}."SesionUsuario"`);
    await runner.query(
      `ALTER TABLE ${schema}."SesionUsuarioLegado" RENAME TO "SesionUsuario"`,
    );
    await runner.query(
      `ALTER TABLE ${schema}."Usuario" DROP COLUMN "correo_Usuario", DROP COLUMN "uuid_Usuario"`,
    );
  }
}
