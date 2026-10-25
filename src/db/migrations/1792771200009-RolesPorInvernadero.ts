import type { MigrationInterface, QueryRunner } from 'typeorm';
import { migrationSchema } from '../migration-schema';

/** Traslada los roles a pertenencias existentes sin conceder acceso a otros invernaderos. */
export class RolesPorInvernadero1792771200009 implements MigrationInterface {
  /** Conserva asignaciones y claves históricas; los invernaderos sin administrador requieren identificar expresamente a su propietario. */
  async up(runner: QueryRunner): Promise<void> {
    const schema = migrationSchema(runner);
    await runner.query(
      `ALTER TABLE ${schema}."UsuarioInvernadero" ADD COLUMN "rol_UsuarioInvernadero" varchar(20) NOT NULL DEFAULT 'OPERATOR', ADD CONSTRAINT "CK_UsuarioInvernadero_Rol" CHECK ("rol_UsuarioInvernadero" IN ('ADMIN','OPERATOR'))`,
    );
    await runner.query(
      `UPDATE ${schema}."UsuarioInvernadero" m SET "rol_UsuarioInvernadero" = 'ADMIN' FROM ${schema}."Usuario" u WHERE u."idUsuario_Usuario" = m."idUsuario_UsuarioInvernadero" AND u.rol = 'Administrador'`,
    );
    // Se archiva el valor anterior únicamente para revertir la migración, sin usarlo en permisos.
    await runner.query(
      `ALTER TABLE ${schema}."Usuario" RENAME COLUMN rol TO "rolHistorico_Usuario"`,
    );
    await runner.query(
      `ALTER TABLE ${schema}."Usuario" ALTER COLUMN "rolHistorico_Usuario" DROP NOT NULL`,
    );
    await runner.query(
      `CREATE INDEX "IX_UsuarioInvernadero_Admin" ON ${schema}."UsuarioInvernadero" ("idInvernadero_UsuarioInvernadero") WHERE "rol_UsuarioInvernadero" = 'ADMIN'`,
    );
  }

  /** Restaura solo roles históricos; las nuevas cuentas quedan como Operador, sin elevar permisos globales. */
  async down(runner: QueryRunner): Promise<void> {
    const schema = migrationSchema(runner);
    await runner.query(
      `UPDATE ${schema}."Usuario" SET "rolHistorico_Usuario" = 'Operador' WHERE "rolHistorico_Usuario" IS NULL`,
    );
    await runner.query(
      `ALTER TABLE ${schema}."Usuario" ALTER COLUMN "rolHistorico_Usuario" SET NOT NULL`,
    );
    await runner.query(
      `ALTER TABLE ${schema}."Usuario" RENAME COLUMN "rolHistorico_Usuario" TO rol`,
    );
    await runner.query(`DROP INDEX ${schema}."IX_UsuarioInvernadero_Admin"`);
    await runner.query(
      `ALTER TABLE ${schema}."UsuarioInvernadero" DROP COLUMN "rol_UsuarioInvernadero"`,
    );
  }
}
