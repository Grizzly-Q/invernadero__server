import type { MigrationInterface, QueryRunner } from 'typeorm';
import { migrationSchema } from '../migration-schema';

/** Registra el punto de partida existente sin recrear ni borrar tablas de negocio. */
export class ReconocerEsquemaInicial1792771200000 implements MigrationInterface {
  /** Verifica las columnas utilizadas por los cambios y protege el historial técnico. */
  async up(queryRunner: QueryRunner): Promise<void> {
    const schema = migrationSchema(queryRunner);
    const required: Record<string, string[]> = {
      Invernadero: ['idInvernadero_Invernadero'],
      Controlador: [
        'idControlador_Controlador',
        'idInvernadero_Controlador',
        'estadoConexion_Controlador',
      ],
      Sensor: [
        'idSensor_Sensor',
        'idControlador_Sensor',
        'tipoSensor',
        'unidadMedida',
        'estadoConexion_Sensor',
      ],
      Medicion: ['idSensor_Medicion', 'fechaHora', 'valor'],
    };
    for (const [name, columns] of Object.entries(required)) {
      const table = await queryRunner.getTable(name);
      if (!table || columns.some((column) => !table.findColumnByName(column))) {
        throw new Error(
          `El esquema inicial de ${name} no coincide con la referencia. No se aplicaron los cambios.`,
        );
      }
      if (name === 'Medicion') {
        const date = table.findColumnByName('fechaHora');
        const keys = table.primaryColumns.map((column) => column.name).sort();
        if (
          date?.type !== 'timestamp without time zone' ||
          keys.join(',') !== 'fechaHora,idSensor_Medicion'
        ) {
          throw new Error(
            'Medicion debe conservar la fecha sin zona y la clave compuesta del esquema inicial.',
          );
        }
      }
    }
    // TypeORM crea esta tabla antes de ejecutar la primera migración.
    await queryRunner.query(
      `ALTER TABLE ${schema}."typeorm_migrations" ENABLE ROW LEVEL SECURITY`,
    );
    await queryRunner.query(
      `REVOKE ALL ON TABLE ${schema}."typeorm_migrations" FROM PUBLIC`,
    );
    await queryRunner.query(`DO $$ BEGIN
      IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
        REVOKE ALL ON TABLE ${schema}."typeorm_migrations" FROM anon;
      END IF;
      IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
        REVOKE ALL ON TABLE ${schema}."typeorm_migrations" FROM authenticated;
      END IF;
    END $$`);
  }

  /** Revertir el marcador no elimina las tablas previas ni desprotege el historial. */
  async down(): Promise<void> {
    // El esquema inicial existía antes de TypeORM y no pertenece a esta migración.
  }
}
