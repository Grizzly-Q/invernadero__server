import { ConflictException, Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { randomUUID } from 'node:crypto';
import { PasswordService } from '../auth/password.service';
import type { PublicUser, UserRecord } from './user.types';
import { UserEntity } from './entities/user.entity';

/** Persiste identidades sin roles globales; los permisos pertenecen a UsuarioInvernadero. */
@Injectable()
export class UsersService {
  constructor(
    private readonly passwords: PasswordService,
    @InjectRepository(UserEntity)
    private readonly users: Repository<UserEntity>,
  ) {}

  /** Busca el correo normalizado e incluye el hash únicamente para verificar credenciales. */
  async findByEmail(email: string): Promise<UserRecord | undefined> {
    const user = await this.users
      .createQueryBuilder('user')
      .addSelect('user.passwordHash')
      .where('user.email = :email', { email: email.trim().toLowerCase() })
      .getOne();
    return user
      ? { ...this.toPublic(user), passwordHash: user.passwordHash }
      : undefined;
  }

  /** Recupera el perfil por UUID sin consultar el hash. */
  async findById(id: string): Promise<PublicUser | undefined> {
    const user = await this.users.findOneBy({ id });
    return user ? this.toPublic(user) : undefined;
  }

  /**
   * Crea una cuenta persistente sin asignarle invernaderos ni privilegios.
   * @returns Perfil sin contraseña, después de confirmar la escritura.
   * @throws ConflictException si el correo ya está registrado, incluso con solicitudes simultáneas.
   */
  async create(
    name: string,
    email: string,
    password: string,
  ): Promise<PublicUser> {
    try {
      const user = await this.users.save(
        this.users.create({
          id: randomUUID(),
          name,
          email: email.trim().toLowerCase(),
          passwordHash: await this.passwords.hash(password),
        }),
      );
      return this.toPublic(user);
    } catch (error) {
      if (
        (error as { driverError?: { code?: string } }).driverError?.code ===
        '23505'
      )
        throw new ConflictException('El correo ya está registrado.');
      throw error;
    }
  }

  /** Expone únicamente identidad, nombre y correo; omite claves internas y credenciales. */
  private toPublic(user: UserEntity): PublicUser {
    return {
      id: user.id,
      name: user.name,
      email: user.email ?? '',
    };
  }
}
