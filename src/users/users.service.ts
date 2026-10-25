import { ConflictException, Injectable, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'node:crypto';
import { InjectRepository } from '@nestjs/typeorm';
import { QueryFailedError, Repository } from 'typeorm';
import { PasswordService } from '../auth/password.service';
import { Role } from './role.enum';
import type { PublicUser, UserRecord } from './user.types';
import { UserAccountEntity } from './entities/user-account.entity';

/** Administra cuentas persistentes de acceso a la API. */
@Injectable()
export class UsersService implements OnModuleInit {
  constructor(
    private readonly passwords: PasswordService,
    private readonly config: ConfigService,
    @InjectRepository(UserAccountEntity)
    private readonly accounts: Repository<UserAccountEntity>,
  ) {}

  /** Crea opcionalmente el administrador inicial desde variables del servidor. */
  async onModuleInit(): Promise<void> {
    const email = this.config.get<string>('ADMIN_EMAIL');
    const password = this.config.get<string>('ADMIN_PASSWORD');
    if (!email && !password) return;
    if (!email || !password || password.length < 8 || password.length > 128) {
      throw new Error(
        'Configure ADMIN_EMAIL y ADMIN_PASSWORD (8 a 128 caracteres).',
      );
    }
    const existing = await this.findByEmail(email);
    if (existing) {
      if (existing.role !== Role.ADMIN) {
        throw new Error(
          'ADMIN_EMAIL ya pertenece a una cuenta que no es Administrador.',
        );
      }
      return;
    }
    await this.create('Administrador', email, password, Role.ADMIN);
  }

  /** Busca credenciales por correo normalizado; usar solo dentro del servidor. */
  async findByEmail(email: string): Promise<UserRecord | undefined> {
    const normalized = email.trim().toLowerCase();
    const account = await this.accounts.findOne({
      where: { email: normalized },
      select: {
        id: true,
        name: true,
        email: true,
        passwordHash: true,
        role: true,
        createdAt: true,
      },
    });
    return account ?? undefined;
  }

  /** Recupera el perfil sin credenciales, o undefined cuando no existe. */
  async findById(id: string): Promise<PublicUser | undefined> {
    const user = await this.accounts.findOneBy({ id });
    return user ? this.toPublic(user) : undefined;
  }

  /**
   * Crea un usuario con rol Operador por defecto; solo el servidor puede asignar otro rol.
   * @returns Perfil creado sin credenciales y persistido en PostgreSQL.
   * @throws ConflictException si el correo normalizado ya está registrado.
   */
  async create(
    name: string,
    email: string,
    password: string,
    role: Role = Role.OPERATOR,
  ): Promise<PublicUser> {
    const normalized = email.trim().toLowerCase();
    const passwordHash = await this.passwords.hash(password);
    const account = this.accounts.create({
      id: randomUUID(),
      name,
      email: normalized,
      role,
      passwordHash,
    });
    try {
      await this.accounts.insert(account);
    } catch (error) {
      if (
        error instanceof QueryFailedError &&
        (error.driverError as { constraint?: string }).constraint ===
          'UQ_CuentaAcceso_Correo'
      ) {
        throw new ConflictException('El correo ya está registrado.');
      }
      throw error;
    }
    return this.toPublic(account);
  }

  /** Lista perfiles sin exponer contraseñas ni hashes. */
  async findAll(): Promise<PublicUser[]> {
    const accounts = await this.accounts.find({ order: { createdAt: 'ASC' } });
    return accounts.map((user) => this.toPublic(user));
  }

  private toPublic(user: UserRecord): PublicUser {
    return { id: user.id, name: user.name, email: user.email, role: user.role };
  }
}
