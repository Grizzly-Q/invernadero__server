import {
  Check,
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
} from 'typeorm';
import type { Relation } from 'typeorm';
import { ControllerEntity } from './controller.entity';

/** Hash de una credencial aleatoria; nunca contiene la clave original del ESP32. */
@Entity({ name: 'CredencialControlador' })
@Unique('UQ_CredencialControlador_Hash', ['credentialHash'])
@Index('IX_CredencialControlador_Controlador', ['controllerId'])
@Check(
  'CK_CredencialControlador_Hash',
  `"hashCredencial_CredencialControlador" ~ '^[0-9a-f]{64}$'`,
)
@Check(
  'CK_CredencialControlador_Expiracion',
  `"fechaExpiracion_CredencialControlador" IS NULL OR "fechaExpiracion_CredencialControlador" > "fechaCreacion_CredencialControlador"`,
)
@Check(
  'CK_CredencialControlador_Revocacion',
  `"fechaRevocacion_CredencialControlador" IS NULL OR "fechaRevocacion_CredencialControlador" >= "fechaCreacion_CredencialControlador"`,
)
export class ControllerCredentialEntity {
  /** Identificador generado de la credencial; se utiliza en la ruta de revocación. */
  @PrimaryGeneratedColumn('identity', {
    name: 'idCredencial_CredencialControlador',
    type: 'bigint',
    generatedIdentity: 'BY DEFAULT',
    primaryKeyConstraintName: 'PK_CredencialControlador',
  })
  id!: string;

  /** Identificador del controlador ESP32 autorizado por esta credencial. */
  @Column({ name: 'idControlador_CredencialControlador', type: 'bigint' })
  controllerId!: string;

  @ManyToOne(() => ControllerEntity, {
    nullable: false,
    onDelete: 'NO ACTION',
    onUpdate: 'NO ACTION',
  })
  @JoinColumn({
    name: 'idControlador_CredencialControlador',
    foreignKeyConstraintName: 'FK_CredencialControlador_Controlador',
  })
  controller!: Relation<ControllerEntity>;

  /** SHA-256 hexadecimal de una clave de alta entropía, no de una contraseña humana. */
  @Column({
    name: 'hashCredencial_CredencialControlador',
    type: 'varchar',
    length: 64,
    select: false,
  })
  credentialHash!: string;

  /** Instante de emisión; el servidor lo establece al generar el secreto aleatorio. */
  @Column({
    name: 'fechaCreacion_CredencialControlador',
    type: 'timestamptz',
    default: () => 'CURRENT_TIMESTAMP',
  })
  createdAt!: Date;

  /** Vencimiento programado; null significa sin vencimiento, sujeto a bloqueo y revocación. */
  @Column({
    name: 'fechaExpiracion_CredencialControlador',
    type: 'timestamptz',
    nullable: true,
  })
  expiresAt!: Date | null;

  /** Primera revocación; null significa no revocada y no garantiza que siga vigente o autorizada. */
  @Column({
    name: 'fechaRevocacion_CredencialControlador',
    type: 'timestamptz',
    nullable: true,
  })
  revokedAt!: Date | null;
}
