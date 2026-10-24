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
import { ControllerEntity } from '../../controllers/entities/controller.entity';

/** Sensor registrado de un ESP32; conserva los tipos y la unicidad del esquema original. */
@Entity({ name: 'Sensor' })
@Unique('UQ_Sensor_Controlador_Tipo', ['controllerId', 'type'])
@Check(
  'CK_Sensor_Conexion',
  `"estadoConexion_Sensor" IN ('Conectado', 'Desconectado')`,
)
@Check(
  'CK_Sensor_Tipo',
  `"tipoSensor" IN ('HumedadAmbiental', 'HumedadSuelo', 'NivelAgua')`,
)
export class SensorEntity {
  @PrimaryGeneratedColumn('identity', {
    name: 'idSensor_Sensor',
    type: 'bigint',
    generatedIdentity: 'BY DEFAULT',
    primaryKeyConstraintName: 'Sensor_pkey',
  })
  id!: string;

  @Column({ name: 'idControlador_Sensor', type: 'bigint' })
  controllerId!: string;

  @ManyToOne(() => ControllerEntity, {
    nullable: false,
    onDelete: 'NO ACTION',
    onUpdate: 'NO ACTION',
  })
  @JoinColumn({
    name: 'idControlador_Sensor',
    foreignKeyConstraintName: 'Sensor_idControlador_Sensor_fkey',
  })
  controller!: Relation<ControllerEntity>;

  @Column({ name: 'tipoSensor', type: 'varchar', length: 30 })
  type!: 'HumedadAmbiental' | 'HumedadSuelo' | 'NivelAgua';

  @Column({ name: 'unidadMedida', type: 'varchar', length: 10 })
  unit!: string;

  @Column({
    name: 'estadoConexion_Sensor',
    type: 'varchar',
    length: 15,
    default: 'Desconectado',
  })
  connectionStatus!: 'Conectado' | 'Desconectado';
}
