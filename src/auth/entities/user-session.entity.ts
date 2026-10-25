import {
  Column,
  Entity,
  Index,
  JoinColumn,
  ManyToOne,
  PrimaryColumn,
} from 'typeorm';
import { UserEntity } from '../../users/entities/user.entity';

/** Sesión con refresh rotatorio; la clave foránea conserva la identidad persistente del usuario. */
@Entity({ name: 'SesionUsuario' })
@Index('IX_SesionUsuarioRefresh_Expiracion', ['expiresAt'])
export class UserSessionEntity {
  @PrimaryColumn({
    name: 'idSesion_SesionUsuario',
    type: 'uuid',
    primaryKeyConstraintName: 'PK_SesionUsuario_Refresh',
  })
  id!: string;

  @Column({ name: 'idUsuario_SesionUsuario', type: 'uuid' })
  userId!: string;

  @ManyToOne(() => UserEntity, { onDelete: 'CASCADE' })
  @JoinColumn({
    name: 'idUsuario_SesionUsuario',
    referencedColumnName: 'id',
    foreignKeyConstraintName: 'FK_SesionUsuario_Usuario',
  })
  user!: UserEntity;

  @Column({ name: 'hashRefresh_SesionUsuario', type: 'varchar', length: 64 })
  refreshHash!: string;

  @Column({ name: 'fechaExpiracion_SesionUsuario', type: 'timestamptz' })
  expiresAt!: Date;

  @Column({
    name: 'fechaRevocacion_SesionUsuario',
    type: 'timestamptz',
    nullable: true,
  })
  revokedAt!: Date | null;
}
