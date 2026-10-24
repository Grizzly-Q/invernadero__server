import {
  Check,
  Column,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
} from 'typeorm';
import type { Relation } from 'typeorm';
import { GreenhouseEntity } from '../../db/entities/greenhouse.entity';

/** Controlador ESP32; sus identificadores bigint se mantienen como texto para evitar pérdida de precisión. */
@Entity({ name: 'Controlador' })
@Unique('Controlador_idInvernadero_Controlador_key', ['greenhouseId'])
@Check(
  'CK_Controlador_Conexion',
  `"estadoConexion_Controlador" IN ('Conectado', 'Desconectado')`,
)
export class ControllerEntity {
  /** Identificador generado por PostgreSQL; se representa como cadena para conservar precisión. */
  @PrimaryGeneratedColumn('identity', {
    name: 'idControlador_Controlador',
    type: 'bigint',
    generatedIdentity: 'BY DEFAULT',
    primaryKeyConstraintName: 'Controlador_pkey',
  })
  id!: string;

  /** Invernadero propietario; la restricción única permite un controlador ESP32 por invernadero. */
  @Column({ name: 'idInvernadero_Controlador', type: 'bigint' })
  greenhouseId!: string;

  @ManyToOne(() => GreenhouseEntity, {
    nullable: false,
    onDelete: 'NO ACTION',
    onUpdate: 'NO ACTION',
  })
  @JoinColumn({
    name: 'idInvernadero_Controlador',
    foreignKeyConstraintName: 'Controlador_idInvernadero_Controlador_fkey',
  })
  greenhouse!: Relation<GreenhouseEntity>;

  /** Estado registrado tras una comunicación o bloqueo; no demuestra presencia continua de la placa. */
  @Column({
    name: 'estadoConexion_Controlador',
    type: 'varchar',
    length: 15,
    default: 'Desconectado',
  })
  connectionStatus!: 'Conectado' | 'Desconectado';

  /** Nombre administrativo del controlador ESP32, independiente de su identificador de autenticación. */
  @Column({ name: 'nombre_Controlador', type: 'varchar', length: 100 })
  name!: string;

  /** Habilita comunicaciones con credenciales vigentes; false las bloquea sin revocarlas. */
  @Column({ name: 'activo_Controlador', type: 'boolean', default: false })
  active!: boolean;

  /** Nulo para controladores ESP32 anteriores a la migración cuya fecha original se desconoce. */
  @Column({
    name: 'fechaCreacion_Controlador',
    type: 'timestamptz',
    nullable: true,
    default: () => 'CURRENT_TIMESTAMP',
  })
  createdAt!: Date | null;

  /** Última comunicación autenticada registrada por el servidor; null si aún no se registró ninguna. */
  @Column({
    name: 'ultimaComunicacionEn_Controlador',
    type: 'timestamptz',
    nullable: true,
  })
  lastSeenAt!: Date | null;
}
