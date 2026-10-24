import { Column, Entity, Index, PrimaryColumn } from 'typeorm';

/** Sesión de usuario identificada por el sid firmado dentro del JWT. */
@Entity({ name: 'SesionUsuario' })
@Index('IX_SesionUsuario_Expiracion', ['expiresAt'])
export class UserSessionEntity {
  @PrimaryColumn({ name: 'idSesion_SesionUsuario', type: 'uuid' })
  id!: string;

  @Column({ name: 'idUsuario_SesionUsuario', type: 'uuid' })
  userId!: string;

  @Column({ name: 'tokenCifrado_SesionUsuario', type: 'text' })
  encryptedToken!: string;

  @Column({ name: 'fechaExpiracion_SesionUsuario', type: 'timestamptz' })
  expiresAt!: Date;
}
