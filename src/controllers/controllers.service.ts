import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import {
  DataSource,
  IsNull,
  LessThan,
  MoreThan,
  QueryFailedError,
} from 'typeorm';
import { GreenhouseEntity } from '../db/entities/greenhouse.entity';
import { SensorEntity } from '../telemetry/entities/sensor.entity';
import { ControllerEntity } from './entities/controller.entity';
import { ControllerCredentialEntity } from './entities/controller-credential.entity';
import { publicController } from './controller.types';
import type { PublicController } from './controller.types';
import type {
  CreateControllerDto,
  CreateSensorDto,
} from './dto/controller.dto';

/** Administración persistente de controladores ESP32 y sus sensores; las rutas exigen rol ADMIN. */
@Injectable()
export class ControllersService {
  constructor(private readonly source: DataSource) {}

  /**
   * Registra un controlador ESP32 desactivado dentro de una transacción.
   * @param dto Identificador del invernadero existente y nombre validado del controlador.
   * @returns Perfil público persistido, sin sensores ni credenciales.
   * @throws NotFoundException si no existe el invernadero.
   * @throws ConflictException si el invernadero ya tiene un controlador ESP32.
   */
  async create(dto: CreateControllerDto): Promise<PublicController> {
    try {
      return await this.source.transaction(async (manager) => {
        if (
          !(await manager.existsBy(GreenhouseEntity, { id: dto.greenhouseId }))
        )
          throw new NotFoundException('Invernadero no encontrado.');
        return publicController(
          await manager.save(
            ControllerEntity,
            manager.create(ControllerEntity, {
              greenhouseId: dto.greenhouseId,
              name: dto.name,
              active: false,
            }),
          ),
        );
      });
    } catch (error) {
      this.rethrowConflict(error, 'El invernadero ya tiene un controlador.');
    }
  }

  /**
   * Consulta hasta 50 controladores ESP32 por id descendente, sin credenciales.
   * @param beforeId Cursor bigint exclusivo opcional: solo incluye IDs menores.
   * @returns Perfiles públicos y nextBeforeId; el cursor es null cuando hay menos de 50 resultados.
   */
  async list(
    beforeId?: string,
  ): Promise<{ items: PublicController[]; nextBeforeId: string | null }> {
    const rows = await this.source.getRepository(ControllerEntity).find({
      where: beforeId ? { id: LessThan(beforeId) } : {},
      order: { id: 'DESC' },
      take: 50,
    });
    return {
      items: rows.map(publicController),
      nextBeforeId: rows.length === 50 ? rows[49].id : null,
    };
  }

  /**
   * Actualiza la autorización del controlador ESP32 bajo bloqueo transaccional compartido con la ingesta.
   * @param id Identificador del controlador ESP32.
   * @param active Estado solicitado; false también marca Desconectado sin revocar credenciales.
   * @returns Perfil público con el estado persistido.
   * @throws NotFoundException si el controlador no existe.
   * @throws BadRequestException al activar sin alguna credencial vigente.
   */
  async setActive(id: string, active: boolean): Promise<PublicController> {
    return this.source.transaction(async (manager) => {
      const controller = await manager.findOne(ControllerEntity, {
        where: { id },
        lock: { mode: 'pessimistic_write' },
      });
      if (!controller)
        throw new NotFoundException('Controlador no encontrado.');
      if (
        active &&
        !(await manager.exists(ControllerCredentialEntity, {
          where: [
            { controllerId: id, revokedAt: IsNull(), expiresAt: IsNull() },
            {
              controllerId: id,
              revokedAt: IsNull(),
              expiresAt: MoreThan(new Date()),
            },
          ],
        }))
      )
        throw new BadRequestException(
          'Emita una credencial vigente antes de activar el controlador.',
        );
      controller.active = active;
      if (!active) controller.connectionStatus = 'Desconectado';
      return publicController(await manager.save(controller));
    });
  }

  /**
   * Consulta hasta 50 credenciales por id descendente, incluidas las vencidas o revocadas.
   * @param controllerId Identificador del controlador ESP32 propietario.
   * @param beforeId Cursor exclusivo opcional para consultar IDs menores.
   * @returns items con id, controllerId, createdAt, expiresAt y revokedAt, y nextBeforeId.
   * Nunca selecciona ni devuelve hashes o secretos originales.
   * @throws NotFoundException si el controlador no existe.
   */
  async listCredentials(controllerId: string, beforeId?: string) {
    await this.requireController(controllerId);
    const rows = await this.source
      .getRepository(ControllerCredentialEntity)
      .find({
        where: {
          controllerId,
          ...(beforeId ? { id: LessThan(beforeId) } : {}),
        },
        order: { id: 'DESC' },
        take: 50,
      });
    return {
      items: rows.map(({ id, createdAt, expiresAt, revokedAt }) => ({
        id,
        controllerId,
        createdAt,
        expiresAt,
        revokedAt,
      })),
      nextBeforeId: rows.length === 50 ? rows[49].id : null,
    };
  }

  /**
   * Obtiene los sensores registrados para preparar sus identificadores en el firmware.
   * @param controllerId Identificador del controlador ESP32.
   * @returns Arreglo de sensores por id ascendente, sin mediciones; vacío si no hay registros.
   * @throws NotFoundException si el controlador no existe.
   */
  async sensors(controllerId: string) {
    await this.requireController(controllerId);
    return this.source
      .getRepository(SensorEntity)
      .find({ where: { controllerId }, order: { id: 'ASC' } });
  }

  /**
   * Persiste un sensor con estado inicial Desconectado; no configura el hardware de la placa.
   * @param controllerId Identificador del controlador ESP32 propietario.
   * @param dto Tipo de sensor permitido y unidad de medida previamente validados.
   * @returns Sensor creado con identificador generado por PostgreSQL.
   * @throws NotFoundException si el controlador no existe.
   * @throws ConflictException si ya existe ese tipo de sensor en el controlador.
   */
  async createSensor(
    controllerId: string,
    dto: CreateSensorDto,
  ): Promise<SensorEntity> {
    try {
      return await this.source.transaction(async (manager) => {
        const controller = await manager.findOne(ControllerEntity, {
          where: { id: controllerId },
          lock: { mode: 'pessimistic_write' },
        });
        if (!controller)
          throw new NotFoundException('Controlador no encontrado.');
        return manager.save(
          SensorEntity,
          manager.create(SensorEntity, {
            controllerId,
            type: dto.type,
            unit: dto.unit,
          }),
        );
      });
    } catch (error) {
      this.rethrowConflict(
        error,
        'El controlador ya tiene un sensor de ese tipo.',
      );
    }
  }

  /** Comprueba existencia antes de consultas administrativas anidadas. */
  private async requireController(id: string): Promise<void> {
    if (!(await this.source.getRepository(ControllerEntity).existsBy({ id })))
      throw new NotFoundException('Controlador no encontrado.');
  }

  /** Traduce únicamente violaciones de unicidad; conserva los demás errores operativos. */
  private rethrowConflict(error: unknown, message: string): never {
    if (
      error instanceof QueryFailedError &&
      (error.driverError as { code?: string }).code === '23505'
    )
      throw new ConflictException(message);
    throw error;
  }
}
