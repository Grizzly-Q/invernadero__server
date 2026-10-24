import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
} from 'typeorm';
import type { Relation } from 'typeorm';
import { SensorEntity } from './sensor.entity';

/** Lectura por sensor; distingue el instante medido de la recepción y evita reenvíos duplicados. */
@Entity({ name: 'Medicion' })
@Unique('UQ_Medicion_Sensor_Lectura', ['sensorId', 'readingId'])
@Index('IX_Medicion_Sensor_MedidoEn', ['sensorId', 'measuredAt'])
// El índice histórico conserva su orden descendente, que este decorador no representa.
@Index('IX_Medicion_MedidoEn', { synchronize: false })
export class MeasurementEntity {
  @PrimaryGeneratedColumn('identity', {
    name: 'idMedicion_Medicion',
    type: 'bigint',
    generatedIdentity: 'BY DEFAULT',
    primaryKeyConstraintName: 'PK_Medicion',
  })
  id!: string;

  @Column({ name: 'idSensor_Medicion', type: 'bigint' })
  sensorId!: string;

  @ManyToOne(() => SensorEntity, {
    nullable: false,
    onDelete: 'NO ACTION',
    onUpdate: 'NO ACTION',
  })
  @JoinColumn({
    name: 'idSensor_Medicion',
    foreignKeyConstraintName: 'Medicion_idSensor_Medicion_fkey',
  })
  sensor!: Relation<SensorEntity>;

  @Column({ name: 'idLectura_Medicion', type: 'varchar', length: 100 })
  readingId!: string;

  /** Puede ser nulo si el ESP32 todavía no sincronizó su reloj. */
  @Column({ name: 'medidoEn_Medicion', type: 'timestamptz', nullable: true })
  measuredAt!: Date | null;

  /** Las mediciones históricas no tenían hora de recepción; conservan null. */
  @Column({
    name: 'recibidoEn_Medicion',
    type: 'timestamptz',
    nullable: true,
    default: () => 'CURRENT_TIMESTAMP',
  })
  receivedAt!: Date | null;

  // PostgreSQL devuelve numeric como texto para conservar su precisión decimal.
  @Column({ name: 'valor', type: 'numeric', precision: 7, scale: 2 })
  value!: string;
}
