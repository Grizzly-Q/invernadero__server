import type { MigrationInterface, QueryRunner } from 'typeorm';
import { migrationSchema } from '../migration-schema';

/** Evita diferencias ficticias entre CURRENT_TIMESTAMP y la normalización now() de TypeORM. */
export class NormalizarFechasPorDefecto1792771200004 implements MigrationInterface {
  /** Usa la expresión equivalente que espera el comparador de esquemas de TypeORM. */
  async up(queryRunner: QueryRunner): Promise<void> {
    const schema = migrationSchema(queryRunner);
    await queryRunner.query(
      `ALTER TABLE ${schema}."Invernadero" ALTER COLUMN "fechaCreacion" SET DEFAULT now()`,
    );
    await queryRunner.query(
      `ALTER TABLE ${schema}."Controlador" ALTER COLUMN "fechaCreacion_Controlador" SET DEFAULT now()`,
    );
    await queryRunner.query(
      `ALTER TABLE ${schema}."CredencialControlador" ALTER COLUMN "fechaCreacion_CredencialControlador" SET DEFAULT now()`,
    );
    await queryRunner.query(
      `ALTER TABLE ${schema}."Medicion" ALTER COLUMN "recibidoEn_Medicion" SET DEFAULT now()`,
    );
  }

  /** Restaura las expresiones anteriores sin cambiar valores ya almacenados. */
  async down(queryRunner: QueryRunner): Promise<void> {
    const schema = migrationSchema(queryRunner);
    await queryRunner.query(
      `ALTER TABLE ${schema}."Invernadero" ALTER COLUMN "fechaCreacion" SET DEFAULT CURRENT_TIMESTAMP`,
    );
    await queryRunner.query(
      `ALTER TABLE ${schema}."Controlador" ALTER COLUMN "fechaCreacion_Controlador" SET DEFAULT CURRENT_TIMESTAMP`,
    );
    await queryRunner.query(
      `ALTER TABLE ${schema}."CredencialControlador" ALTER COLUMN "fechaCreacion_CredencialControlador" SET DEFAULT CURRENT_TIMESTAMP`,
    );
    await queryRunner.query(
      `ALTER TABLE ${schema}."Medicion" ALTER COLUMN "recibidoEn_Medicion" SET DEFAULT CURRENT_TIMESTAMP`,
    );
  }
}
