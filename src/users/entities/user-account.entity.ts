import { Check, Column, Entity, PrimaryColumn, Unique } from 'typeorm';
import { Role } from '../role.enum';

/** Cuenta de inicio de sesión de la API; distinta de public.Usuario. */
@Entity({ name: 'CuentaAcceso' })
@Unique('UQ_CuentaAcceso_Correo', ['email'])
@Check('CK_CuentaAcceso_Rol', `"rol_CuentaAcceso" IN ('ADMIN', 'OPERATOR')`)
export class UserAccountEntity {
  @PrimaryColumn({ name: 'idCuenta_CuentaAcceso', type: 'uuid' })
  id!: string;

  @Column({ name: 'nombre_CuentaAcceso', type: 'varchar', length: 80 })
  name!: string;

  @Column({ name: 'correo_CuentaAcceso', type: 'varchar', length: 254 })
  email!: string;

  @Column({
    name: 'hashContrasena_CuentaAcceso',
    type: 'varchar',
    length: 255,
    select: false,
  })
  passwordHash!: string;

  @Column({ name: 'rol_CuentaAcceso', type: 'varchar', length: 20 })
  role!: Role;

  @Column({
    name: 'fechaCreacion_CuentaAcceso',
    type: 'timestamptz',
    default: () => 'CURRENT_TIMESTAMP',
  })
  createdAt!: Date;
}
