import { Column, Entity, PrimaryGeneratedColumn } from 'typeorm';

/** Cuenta persistente: conserva la clave bigint histórica y expone un UUID a la API. */
@Entity({ name: 'Usuario' })
export class UserEntity {
  @PrimaryGeneratedColumn({ name: 'idUsuario_Usuario', type: 'bigint' })
  databaseId!: string;

  @Column({
    name: 'uuid_Usuario',
    type: 'uuid',
    unique: true,
    default: () => 'gen_random_uuid()',
  })
  id!: string;

  @Column({ name: 'nombreUsuario', type: 'varchar', length: 80 })
  name!: string;

  // Las cuentas históricas requieren asociar un correo antes de poder iniciar sesión.
  @Column({
    name: 'correo_Usuario',
    type: 'varchar',
    length: 254,
    nullable: true,
    unique: true,
  })
  email!: string | null;

  @Column({ name: 'contrasena', type: 'varchar', length: 255, select: false })
  passwordHash!: string;
}
