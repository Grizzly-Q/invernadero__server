import {
  BadRequestException,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from '@nestjs/common';
import { createHash, randomBytes } from 'node:crypto';
import { DataSource, IsNull } from 'typeorm';
import type { EntityManager } from 'typeorm';
import { ControllerEntity } from './entities/controller.entity';
import { ControllerCredentialEntity } from './entities/controller-credential.entity';
import type {
  ControllerIdentity,
  IssuedControllerCredential,
} from './controller.types';

/** Aprovisiona claves aleatorias y serializa su uso con desactivación, revocación y rotación. */
@Injectable()
export class ControllerCredentialsService {
  constructor(private readonly source: DataSource) {}

  /**
   * Genera 32 bytes aleatorios y persiste únicamente su SHA-256.
   * @param controllerId Identificador del controlador ESP32 que recibirá la credencial; emitirla no lo activa.
   * @param expiresAt Vencimiento futuro opcional.
   * @param replace Si es true, revoca todas las claves previas en la misma transacción.
   * @returns Clave original, que no podrá recuperarse después de esta emisión.
   * @throws NotFoundException si no existe el controlador ESP32; BadRequestException si la fecha no es futura.
   */
  async issue(
    controllerId: string,
    expiresAt?: string | null,
    replace = false,
  ): Promise<IssuedControllerCredential> {
    return this.source.transaction(async (manager) => {
      await this.lockController(manager, controllerId);
      const expiry = expiresAt ? new Date(expiresAt) : null;
      const now = new Date();
      if (
        expiry &&
        (!Number.isFinite(expiry.getTime()) ||
          expiry.getTime() <= now.getTime())
      ) {
        throw new BadRequestException(
          'El vencimiento debe ser una fecha futura.',
        );
      }
      if (replace)
        await manager.update(
          ControllerCredentialEntity,
          { controllerId, revokedAt: IsNull() },
          { revokedAt: now },
        );
      const credential = `esp32_${randomBytes(32).toString('base64url')}`;
      const record = await manager.save(
        ControllerCredentialEntity,
        manager.create(ControllerCredentialEntity, {
          controllerId,
          credentialHash: this.hash(credential),
          createdAt: now,
          expiresAt: expiry,
          revokedAt: null,
        }),
      );
      return {
        id: record.id,
        controllerId,
        credential,
        tokenType: 'Bearer',
        createdAt: record.createdAt,
        expiresAt: record.expiresAt,
      };
    });
  }

  /**
   * Revoca una credencial sin eliminar su registro; repetirlo conserva la fecha de revocación original.
   * @param controllerId Identificador del controlador ESP32 propietario.
   * @param credentialId Identificador de la credencial que se revocará.
   * @returns Promesa sin contenido al finalizar la transacción.
   * @throws NotFoundException si no existe el controlador o la credencial no le pertenece.
   */
  async revoke(controllerId: string, credentialId: string): Promise<void> {
    await this.source.transaction(async (manager) => {
      await this.lockController(manager, controllerId);
      const credential = await manager.findOneBy(ControllerCredentialEntity, {
        id: credentialId,
        controllerId,
      });
      if (!credential)
        throw new NotFoundException(
          'Credencial no encontrada para este controlador.',
        );
      if (!credential.revokedAt)
        await manager.update(ControllerCredentialEntity, credential.id, {
          revokedAt: new Date(),
        });
    });
  }

  /**
   * Autentica una credencial de controlador ESP32 comprobando formato, hash, vigencia y estado activo.
   * @param token Secreto Bearer original con prefijo esp32_; nunca un JWT de usuario humano.
   * @returns Identidad con id, greenhouseId y credentialId; no actualiza la última comunicación.
   * @throws UnauthorizedException si la credencial no es válida o el controlador está desactivado.
   */
  async authenticate(token: string): Promise<ControllerIdentity> {
    if (!/^esp32_[A-Za-z0-9_-]{43}$/.test(token)) throw this.unauthorized();
    const credential = await this.source
      .getRepository(ControllerCredentialEntity)
      .findOne({
        where: { credentialHash: this.hash(token) },
        relations: { controller: true },
      });
    if (!credential || !credential.controller.active || !this.valid(credential))
      throw this.unauthorized();
    return {
      id: credential.controller.id,
      greenhouseId: credential.controller.greenhouseId,
      credentialId: credential.id,
    };
  }

  /**
   * Revalida los permisos de una conexión persistente sin conservar su secreto original.
   * @param identity Identidad establecida al autenticar el controlador ESP32.
   * @returns Promesa sin contenido si el controlador está activo y la credencial sigue vigente.
   * No actualiza la última comunicación.
   * @throws UnauthorizedException si cambió la identidad, se bloqueó el controlador o la credencial dejó de ser válida.
   */
  async verifyIdentity(identity: ControllerIdentity): Promise<void> {
    const credential = await this.source
      .getRepository(ControllerCredentialEntity)
      .findOne({
        where: { id: identity.credentialId, controllerId: identity.id },
        relations: { controller: true },
      });
    if (
      !credential ||
      !credential.controller.active ||
      credential.controller.greenhouseId !== identity.greenhouseId ||
      !this.valid(credential)
    )
      throw this.unauthorized();
  }

  /**
   * Revalida la identidad bajo bloqueo antes de operar, evitando carreras con revocaciones.
   * @param identity Identidad incorporada por el guard global.
   * @param operation Trabajo transaccional; un fallo revierte también la última comunicación.
   * @returns Resultado del trabajo, después de actualizar lastSeenAt y marcar el controlador ESP32 como Conectado.
   * @throws UnauthorizedException si el controlador ESP32 o la credencial dejaron de estar autorizados.
   */
  async withController<T>(
    identity: ControllerIdentity,
    operation: (
      controller: ControllerEntity,
      manager: EntityManager,
    ) => T | Promise<T>,
  ): Promise<T> {
    return this.source.transaction(async (manager) => {
      const controller = await manager.findOne(ControllerEntity, {
        where: { id: identity.id },
        lock: { mode: 'pessimistic_write' },
      });
      const credential = await manager.findOneBy(ControllerCredentialEntity, {
        id: identity.credentialId,
        controllerId: identity.id,
      });
      if (
        !controller?.active ||
        controller.greenhouseId !== identity.greenhouseId ||
        !credential ||
        !this.valid(credential)
      )
        throw this.unauthorized();
      controller.lastSeenAt = new Date();
      controller.connectionStatus = 'Conectado';
      await manager.update(ControllerEntity, controller.id, {
        lastSeenAt: controller.lastSeenAt,
        connectionStatus: controller.connectionStatus,
      });
      return operation(controller, manager);
    });
  }

  /** Bloquea la fila del controlador ESP32 para serializar cambios administrativos con la recepción de lecturas. */
  private async lockController(
    manager: EntityManager,
    id: string,
  ): Promise<ControllerEntity> {
    const controller = await manager.findOne(ControllerEntity, {
      where: { id },
      lock: { mode: 'pessimistic_write' },
    });
    if (!controller) throw new NotFoundException('Controlador no encontrado.');
    return controller;
  }

  /** Comprueba vigencia usando el reloj del servidor; la clave no contiene claims de confianza. */
  private valid(credential: ControllerCredentialEntity): boolean {
    return (
      !credential.revokedAt &&
      (!credential.expiresAt || credential.expiresAt.getTime() > Date.now())
    );
  }

  /** La alta entropía permite usar SHA-256 sin el coste de un hash para contraseñas humanas. */
  private hash(credential: string): string {
    return createHash('sha256').update(credential, 'utf8').digest('hex');
  }

  /** Unifica la respuesta para no revelar si existe una clave o por qué fue rechazada. */
  private unauthorized(): UnauthorizedException {
    return new UnauthorizedException(
      'Credencial de controlador inválida o no autorizada.',
    );
  }
}
