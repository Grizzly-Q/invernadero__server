import { Check, Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

/** Mapea el invernadero existente sin modificar sus columnas ni fechas históricas. */
@Entity({ name: 'Invernadero' })
@Check(
  'CK_Invernadero_Dimensiones',
  'largo > 0 AND ancho > 0 AND (alto IS NULL OR alto > 0)',
)
@Check(
  'CK_Invernadero_Estado',
  `"estado_Invernadero" IN ('Activo', 'EnMantenimiento', 'Desactivado')`,
)
@Check('CK_Invernadero_Modo', `"modoOperacion" IN ('Manual', 'Automatico')`)
export class GreenhouseEntity {
  @PrimaryGeneratedColumn('identity', {
    name: 'idInvernadero_Invernadero',
    type: 'bigint',
    generatedIdentity: 'BY DEFAULT',
    primaryKeyConstraintName: 'Invernadero_pkey',
  })
  id!: string;

  @Column({ name: 'nombre_Invernadero', type: 'varchar', length: 100 })
  name!: string;

  @Column({ name: 'ubicacion', type: 'varchar', length: 200 })
  location!: string;

  @Column({ name: 'largo', type: 'numeric', precision: 8, scale: 2 })
  length!: string;

  @Column({ name: 'ancho', type: 'numeric', precision: 8, scale: 2 })
  width!: string;

  @Column({
    name: 'alto',
    type: 'numeric',
    precision: 8,
    scale: 2,
    nullable: true,
  })
  height!: string | null;

  @Column({ name: 'descripcion', type: 'varchar', length: 500, nullable: true })
  description!: string | null;

  @Column({
    name: 'fechaCreacion',
    type: 'timestamp without time zone',
    default: () => 'CURRENT_TIMESTAMP',
  })
  createdAt!: Date;

  @Column({
    name: 'estado_Invernadero',
    type: 'varchar',
    length: 20,
    default: 'Activo',
  })
  status!: 'Activo' | 'EnMantenimiento' | 'Desactivado';

  @Column({
    name: 'modoOperacion',
    type: 'varchar',
    length: 15,
    default: 'Manual',
  })
  operationMode!: 'Manual' | 'Automatico';
}
