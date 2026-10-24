import {
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { DataSource } from 'typeorm';
import { UsersService } from '../../users/users.service';
import type { PublicUser } from '../../users/user.types';
import { Role } from '../../users/role.enum';
import { SensorEntity } from '../entities/sensor.entity';

/** Autoriza sensores por asignación real, sin equiparar UUID temporales con bigint de PostgreSQL. */
@Injectable()
export class MonitoringAccessService {
  // La asociación tiene el mismo ciclo de vida que las cuentas humanas actuales, que siguen en memoria.
  private readonly identities = new Map<string, string>();

  constructor(
    private readonly source: DataSource,
    private readonly users: UsersService,
  ) {}

  /** Vincula un Operador existente con un Usuario Operador de PostgreSQL; solo lo invoca la ruta ADMIN. */
  async link(
    userId: string,
    databaseUserId: string,
  ): Promise<{ userId: string; databaseUserId: string }> {
    const user = this.users.findById(userId);
    if (!user) throw new NotFoundException('Usuario de la API no encontrado.');
    if (user.role !== Role.OPERATOR)
      throw new ForbiddenException(
        'La asociación corresponde únicamente a Operadores.',
      );
    const rows = await this.source.query<Array<{ rol: string }>>(
      `SELECT rol FROM ${this.schema()}."Usuario" WHERE "idUsuario_Usuario" = $1`,
      [databaseUserId],
    );
    if (rows[0]?.rol !== 'Operador')
      throw new ForbiddenException(
        'El usuario PostgreSQL debe existir y ser Operador.',
      );
    if (
      [...this.identities].some(
        ([id, linked]) => id !== userId && linked === databaseUserId,
      )
    )
      throw new ConflictException(
        'Ese usuario PostgreSQL ya está vinculado con otra cuenta.',
      );
    this.identities.set(userId, databaseUserId);
    return { userId, databaseUserId };
  }

  /** Quita la asociación; las conexiones existentes pierden acceso en la siguiente comprobación. */
  unlink(userId: string): void {
    this.identities.delete(userId);
  }

  /** Devuelve el sensor solo para ADMIN o un Operador vinculado y asignado a su invernadero. */
  async sensor(user: PublicUser, sensorId: string): Promise<SensorEntity> {
    const sensor = await this.source
      .getRepository(SensorEntity)
      .findOne({ where: { id: sensorId }, relations: { controller: true } });
    if (!sensor) throw new NotFoundException('Sensor no encontrado.');
    if (user.role === Role.ADMIN) return sensor;
    const databaseUserId = this.identities.get(user.id);
    if (user.role !== Role.OPERATOR || !databaseUserId)
      throw new ForbiddenException(
        'El usuario no tiene una identidad PostgreSQL vinculada.',
      );
    const assigned = await this.source.query<Array<{ permitido: boolean }>>(
      `SELECT EXISTS (
      SELECT 1 FROM ${this.schema()}."UsuarioInvernadero" a
      JOIN ${this.schema()}."Usuario" u ON u."idUsuario_Usuario" = a."idUsuario_UsuarioInvernadero"
      WHERE a."idUsuario_UsuarioInvernadero" = $1 AND a."idInvernadero_UsuarioInvernadero" = $2 AND u.rol = 'Operador'
    ) AS permitido`,
      [databaseUserId, sensor.controller.greenhouseId],
    );
    if (!assigned[0]?.permitido)
      throw new ForbiddenException(
        'El usuario no está asignado a ese invernadero.',
      );
    return sensor;
  }

  /** Escapa el esquema configurado, incluido el esquema aislado de las pruebas. */
  private schema(): string {
    if (this.source.options.type !== 'postgres')
      throw new Error('El monitoreo requiere PostgreSQL.');
    return this.source.driver.escape(this.source.options.schema ?? 'public');
  }
}
