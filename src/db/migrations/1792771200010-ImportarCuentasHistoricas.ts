import type { MigrationInterface, QueryRunner } from 'typeorm';
import { migrationSchema } from '../migration-schema';

/** Conserva las cuentas de CuentaAcceso encontradas en instalaciones con una migración externa. */
export class ImportarCuentasHistoricas1792771200010 implements MigrationInterface {
  /** Copia identidad y hash sin otorgar roles globales, borrar el origen ni restablecer contraseñas. */
  async up(runner: QueryRunner): Promise<void> {
    const schema = migrationSchema(runner);
    if (!(await runner.hasTable('CuentaAcceso'))) return;
    // Una carga histórica con IDs explícitos puede haber dejado la secuencia detrás del máximo.
    await runner.query(
      `SELECT setval(pg_get_serial_sequence('${schema}."Usuario"', 'idUsuario_Usuario'), GREATEST(COALESCE((SELECT max("idUsuario_Usuario") FROM ${schema}."Usuario"),1), nextval(pg_get_serial_sequence('${schema}."Usuario"', 'idUsuario_Usuario'))), true)`,
    );
    await runner.query(`INSERT INTO ${schema}."Usuario" ("uuid_Usuario", "nombreUsuario", "correo_Usuario", contrasena)
      SELECT c."idCuenta_CuentaAcceso", c."nombre_CuentaAcceso", lower(btrim(c."correo_CuentaAcceso")), c."hashContrasena_CuentaAcceso"
      FROM ${schema}."CuentaAcceso" c
      WHERE NOT EXISTS (SELECT 1 FROM ${schema}."Usuario" u WHERE u."uuid_Usuario" = c."idCuenta_CuentaAcceso")`);
  }

  /** Conserva las cuentas importadas al revertir para no borrar identidades ni actividad posterior. */
  async down(): Promise<void> {
    // La importación no elimina usuarios ni relaciones al revertir el marcador.
  }
}
