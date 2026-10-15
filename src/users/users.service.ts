import { ConflictException, Injectable, OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { randomUUID } from 'node:crypto';
import { PasswordService } from '../auth/password.service';
import { Role } from './role.enum';
import type { PublicUser, UserRecord } from './user.types';

/** Almacén temporal: sustituir por persistencia antes de desplegar en producción. */
@Injectable()
export class UsersService implements OnModuleInit {
  private readonly users = new Map<string, UserRecord>();

  constructor(
    private readonly passwords: PasswordService,
    private readonly config: ConfigService,
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
    await this.create('Administrador', email, password, Role.ADMIN);
  }

  /** Busca credenciales por correo normalizado; usar solo dentro del servidor. */
  findByEmail(email: string): UserRecord | undefined {
    const normalized = email.trim().toLowerCase();
    return [...this.users.values()].find((user) => user.email === normalized);
  }

  /** Recupera el perfil sin credenciales, o undefined cuando no existe. */
  findById(id: string): PublicUser | undefined {
    const user = this.users.get(id);
    return user ? this.toPublic(user) : undefined;
  }

  /** Crea un usuario y lanza ConflictException si el correo ya está registrado. */
  async create(
    name: string,
    email: string,
    password: string,
    role: Role = Role.USER,
  ): Promise<PublicUser> {
    const normalized = email.trim().toLowerCase();
    const passwordHash = await this.passwords.hash(password);
    // La comprobación ocurre después del await para evitar registros concurrentes duplicados.
    if (this.findByEmail(normalized)) {
      throw new ConflictException('El correo ya está registrado.');
    }
    const user: UserRecord = {
      id: randomUUID(),
      name,
      email: normalized,
      role,
      passwordHash,
    };
    this.users.set(user.id, user);
    return this.toPublic(user);
  }

  /** Lista perfiles sin exponer contraseñas ni hashes. */
  findAll(): PublicUser[] {
    return [...this.users.values()].map((user) => this.toPublic(user));
  }

  private toPublic(user: UserRecord): PublicUser {
    return { id: user.id, name: user.name, email: user.email, role: user.role };
  }
}
