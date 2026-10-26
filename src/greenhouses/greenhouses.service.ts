import { Injectable, NotFoundException } from '@nestjs/common';
import { DataSource } from 'typeorm';
import { GreenhouseEntity } from '../db/entities/greenhouse.entity';
import { ControllerEntity } from '../controllers/entities/controller.entity';
import { SensorEntity } from '../telemetry/entities/sensor.entity';
import { UserEntity } from '../users/entities/user.entity';
import { Role } from '../users/role.enum';
import { GreenhouseAccessService } from './greenhouse-access.service';
import {
  CreateGreenhouseDto,
  UpdateGreenhouseDto,
  GreenhouseStatusDto,
} from './greenhouse.dto';

/** Administra datos y estado de invernaderos con autorización persistente por pertenencia. */
@Injectable()
export class GreenhousesService {
  constructor(
    private readonly source: DataSource,
    private readonly access: GreenhouseAccessService,
  ) {}

  /**
   * Crea invernadero y pertenencia ADMIN en la misma transacción; cualquier fallo revierte ambas escrituras.
   * @param userId UUID verificado de la cuenta creadora.
   * @param dto Datos y dimensiones previamente validados, sin propietario externo.
   * @returns Invernadero persistido con el rol ADMIN de su creador.
   * @throws NotFoundException si la cuenta dejó de existir; propaga errores PostgreSQL sin escrituras parciales.
   */
  async create(userId: string, dto: CreateGreenhouseDto) {
    return this.source.transaction(async (manager) => {
      const user = await manager.findOneBy(UserEntity, { id: userId });
      if (!user) throw new NotFoundException('Cuenta no encontrada.');
      const greenhouse = await manager.save(
        GreenhouseEntity,
        manager.create(GreenhouseEntity, {
          name: dto.name,
          location: dto.location,
          length: String(dto.length),
          width: String(dto.width),
          height: dto.height == null ? null : String(dto.height),
          description: dto.description ?? null,
        }),
      );
      await manager.query(
        `INSERT INTO ${this.access.schema()}."UsuarioInvernadero"
        ("idUsuario_UsuarioInvernadero", "idInvernadero_UsuarioInvernadero", "rol_UsuarioInvernadero") VALUES ($1, $2, 'ADMIN')`,
        [user.databaseId, greenhouse.id],
      );
      return { ...greenhouse, role: Role.ADMIN };
    });
  }

  /** Lista hasta 50 pertenencias por página; nunca devuelve invernaderos ajenos. */
  async list(userId: string, beforeId?: string) {
    const schema = this.access.schema();
    const items = await this.source.query<
      Array<GreenhouseEntity & { role: Role }>
    >(
      `SELECT
      g."idInvernadero_Invernadero"::text AS id, g."nombre_Invernadero" AS name,
      g.ubicacion AS location, g.largo::text AS length, g.ancho::text AS width, g.alto::text AS height,
      g.descripcion AS description, g."fechaCreacion" AS "createdAt", g."estado_Invernadero" AS status,
      g."modoOperacion" AS "operationMode", m."rol_UsuarioInvernadero" AS role
      FROM ${schema}."Invernadero" g JOIN ${schema}."UsuarioInvernadero" m ON m."idInvernadero_UsuarioInvernadero" = g."idInvernadero_Invernadero"
      JOIN ${schema}."Usuario" u ON u."idUsuario_Usuario" = m."idUsuario_UsuarioInvernadero"
      WHERE u."uuid_Usuario" = $1 AND ($2::bigint IS NULL OR g."idInvernadero_Invernadero" < $2::bigint)
      ORDER BY g."idInvernadero_Invernadero" DESC LIMIT 50`,
      [userId, beforeId ?? null],
    );
    return { items, nextBeforeId: items.length === 50 ? items[49].id : null };
  }

  /** Devuelve un invernadero y el rol actual de la cuenta; deniega el acceso si no hay pertenencia. */
  async get(userId: string, id: string) {
    const role = await this.access.require(userId, id);
    const greenhouse = await this.source
      .getRepository(GreenhouseEntity)
      .findOneBy({ id });
    if (!greenhouse) throw new NotFoundException('Invernadero no encontrado.');
    return { ...greenhouse, role };
  }

  /**
   * Actualiza únicamente los campos recibidos; el estado y el equipo no forman parte de esta operación.
   * @param userId Cuenta autenticada que debe conservar una pertenencia ADMIN.
   * @param id Identificador del invernadero.
   * @param dto Cambios validados; null elimina alto o descripción y omitir conserva el valor.
   * @returns Perfil actualizado con rol ADMIN.
   * @throws ForbiddenException sin permiso; NotFoundException si no existe. Un fallo revierte todos los cambios.
   */
  async update(userId: string, id: string, dto: UpdateGreenhouseDto) {
    return this.source.transaction(async (manager) => {
      const role = await this.access.require(userId, id, [Role.ADMIN], manager);
      const greenhouse = await manager.findOne(GreenhouseEntity, {
        where: { id },
        lock: { mode: 'pessimistic_write' },
      });
      if (!greenhouse)
        throw new NotFoundException('Invernadero no encontrado.');
      if (dto.name !== undefined) greenhouse.name = dto.name;
      if (dto.location !== undefined) greenhouse.location = dto.location;
      if (dto.length !== undefined) greenhouse.length = String(dto.length);
      if (dto.width !== undefined) greenhouse.width = String(dto.width);
      if (dto.height !== undefined)
        greenhouse.height = dto.height === null ? null : String(dto.height);
      if (dto.description !== undefined)
        greenhouse.description = dto.description;
      return { ...(await manager.save(GreenhouseEntity, greenhouse)), role };
    });
  }

  /**
   * Cambia el estado sin borrar datos; desactivar bloquea el ESP32 y desconecta sus sensores atómicamente.
   * El orden de bloqueo invernadero → controlador coincide con el registro y la activación de equipos.
   * @param userId Cuenta autenticada con pertenencia ADMIN.
   * @param id Identificador del invernadero.
   * @param status Estado validado; reactivar no habilita el ESP32 ni revoca credenciales.
   * @returns Perfil actualizado con el estado persistido.
   * @throws ForbiddenException sin permiso; NotFoundException si no existe. No hay escrituras parciales.
   */
  async setStatus(
    userId: string,
    id: string,
    status: GreenhouseStatusDto['status'],
  ) {
    return this.source.transaction(async (manager) => {
      const role = await this.access.require(userId, id, [Role.ADMIN], manager);
      const greenhouse = await manager.findOne(GreenhouseEntity, {
        where: { id },
        lock: { mode: 'pessimistic_write' },
      });
      if (!greenhouse)
        throw new NotFoundException('Invernadero no encontrado.');
      if (status === 'Desactivado') {
        const controller = await manager.findOne(ControllerEntity, {
          where: { greenhouseId: id },
          lock: { mode: 'pessimistic_write' },
        });
        if (controller) {
          await manager.update(ControllerEntity, controller.id, {
            active: false,
            connectionStatus: 'Desconectado',
          });
          await manager.update(
            SensorEntity,
            { controllerId: controller.id },
            { connectionStatus: 'Desconectado' },
          );
        }
      }
      greenhouse.status = status;
      return { ...(await manager.save(GreenhouseEntity, greenhouse)), role };
    });
  }

  /**
   * Consulta el inventario público para seleccionar un sensor del historial, incluso con el equipo bloqueado.
   * @param userId Cuenta autenticada con pertenencia ADMIN u OPERATOR.
   * @param id Identificador del invernadero autorizado.
   * @returns Invernadero, controlador opcional e identificadores, tipos, unidades y estados de sus sensores; nunca claves.
   * @throws ForbiddenException si no hay pertenencia; NotFoundException si el recurso dejó de existir.
   */
  async sensors(userId: string, id: string) {
    await this.access.require(userId, id);
    const greenhouse = await this.source
      .getRepository(GreenhouseEntity)
      .findOneBy({ id });
    if (!greenhouse) throw new NotFoundException('Invernadero no encontrado.');
    const controller = await this.source
      .getRepository(ControllerEntity)
      .findOneBy({ greenhouseId: id });
    if (!controller) return { greenhouseId: id, controllerId: null, items: [] };
    const sensors = await this.source.getRepository(SensorEntity).find({
      where: { controllerId: controller.id },
      select: {
        id: true,
        controllerId: true,
        type: true,
        unit: true,
        connectionStatus: true,
      },
      order: { id: 'ASC' },
    });
    return {
      greenhouseId: id,
      controllerId: controller.id,
      items: sensors.map((sensor) => ({
        id: sensor.id,
        controllerId: sensor.controllerId,
        type: sensor.type,
        unit: sensor.unit,
        connectionStatus: sensor.connectionStatus,
      })),
    };
  }

  /** Lista hasta 100 miembros por página; solo el administrador de ese invernadero accede a los correos. */
  async members(userId: string, id: string, beforeId?: string) {
    await this.access.require(userId, id, [Role.ADMIN]);
    const schema = this.access.schema();
    return this.source.query<
      Array<{
        databaseId: string;
        id: string;
        name: string;
        email: string | null;
        role: Role;
      }>
    >(
      `SELECT u."idUsuario_Usuario"::text AS "databaseId", u."uuid_Usuario" AS id,
      u."nombreUsuario" AS name, u."correo_Usuario" AS email, m."rol_UsuarioInvernadero" AS role
      FROM ${schema}."UsuarioInvernadero" m JOIN ${schema}."Usuario" u ON u."idUsuario_Usuario" = m."idUsuario_UsuarioInvernadero"
      WHERE m."idInvernadero_UsuarioInvernadero" = $1 AND ($2::bigint IS NULL OR u."idUsuario_Usuario" < $2::bigint)
      ORDER BY u."idUsuario_Usuario" DESC LIMIT 100`,
      [id, beforeId ?? null],
    );
  }
}
