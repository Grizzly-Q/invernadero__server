import {
  BadRequestException,
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { AuthService } from '../../auth/auth.service';
import { ControllerCredentialsService } from '../../controllers/controller-credentials.service';
import type { ControllerIdentity } from '../../controllers/controller.types';
import { SensorEntity } from '../entities/sensor.entity';
import { validateSensorReading } from '../validate-sensor-reading';
import { LiveSessionRegistry } from './live-session-registry';
import type { DeviceCommand } from './live-session-registry';
import { MonitoringAccessService } from './monitoring-access.service';
import {
  LiveReadingDto,
  MonitoringAckDto,
  SensorSubscriptionDto,
  StartMonitoringDto,
} from './monitoring.dto';
import { validateMessage } from './validate-message';

/** Canal de equipo identificado sin guardar su clave original. */
interface Device {
  connectionId: string;
  identity: ControllerIdentity;
  send: (command: DeviceCommand) => boolean;
  close: () => void;
}

/** Canal de persona; el JWT se revalida antes de entregar cada lectura. */
interface Viewer {
  token: string;
  emit: (event: string, payload: unknown, volatile?: boolean) => void;
  close: () => void;
}

/** Coordina identidad, permisos y sesiones efímeras; el canal rápido no escribe Medicion. */
@Injectable()
export class MonitoringService {
  private readonly devices = new Map<string, Device>();
  private readonly viewers = new Map<string, Viewer>();
  private sweeping = false;
  readonly sessions = new LiveSessionRegistry(
    (id, command) => this.devices.get(id)?.send(command) ?? false,
    (id, state) => this.viewers.get(id)?.emit('monitoring.state', state),
  );

  constructor(
    private readonly auth: AuthService,
    private readonly credentials: ControllerCredentialsService,
    private readonly access: MonitoringAccessService,
  ) {}

  /** Registra una conexión autenticada; una reconexión sustituye a la anterior sin revivir suscripciones. */
  async addDevice(
    identity: ControllerIdentity,
    send: Device['send'],
    close: Device['close'],
  ): Promise<string> {
    await this.credentials.verifyIdentity(identity);
    if (!this.devices.has(identity.id) && this.devices.size >= 128)
      throw new ServiceUnavailableException(
        'Límite de controladores conectados.',
      );
    const previous = this.devices.get(identity.id);
    if (previous) {
      this.removeDevice(identity.id, previous.connectionId);
      previous.close();
    }
    const connectionId = randomUUID();
    this.devices.set(identity.id, { connectionId, identity, send, close });
    return connectionId;
  }

  /** Ignora cierres tardíos de una conexión anterior del mismo equipo. */
  removeDevice(controllerId: string, connectionId: string): void {
    if (this.devices.get(controllerId)?.connectionId !== connectionId) return;
    this.sessions.removeDevice(controllerId);
    this.devices.delete(controllerId);
  }

  /** Añade una conexión de React o Android después de validar su sesión humana. */
  async addViewer(
    id: string,
    token: string,
    emit: Viewer['emit'],
    close: Viewer['close'],
  ): Promise<void> {
    await this.auth.authenticate(token);
    if (this.viewers.size >= 256)
      throw new ServiceUnavailableException(
        'Límite de espectadores conectados.',
      );
    this.viewers.set(id, { token, emit, close });
  }

  /** Libera todas las concesiones de la aplicación cuya conexión se cerró. */
  removeViewer(id: string): void {
    this.sessions.removeViewer(id);
    this.viewers.delete(id);
  }

  /** Autoriza y solicita un sensor; responde starting hasta recibir confirmación de la placa. */
  async start(viewerId: string, payload: unknown) {
    const dto = validateMessage(StartMonitoringDto, payload);
    const sensor = await this.authorize(viewerId, dto.sensorId);
    const device = this.devices.get(sensor.controllerId);
    if (!sensor.controller.active || !device)
      throw new ServiceUnavailableException(
        'El ESP32 no está conectado o está desactivado.',
      );
    await this.credentials.verifyIdentity(device.identity);
    if (
      !this.viewers.has(viewerId) ||
      this.devices.get(sensor.controllerId) !== device
    )
      throw new ServiceUnavailableException(
        'La conexión cambió; vuelva a iniciar el monitoreo.',
      );
    return this.sessions.subscribe(
      viewerId,
      dto.sensorId,
      sensor.controllerId,
      dto.intervalMs ?? 1000,
    );
  }

  /** Renueva únicamente una concesión aún vigente; El cliente debe llamarlo cada 20 segundos. */
  async renew(viewerId: string, payload: unknown) {
    const dto = validateMessage(SensorSubscriptionDto, payload);
    await this.authorize(viewerId, dto.sensorId);
    try {
      return this.sessions.renew(viewerId, dto.sensorId);
    } catch {
      throw new BadRequestException(
        'La suscripción venció; vuelva a iniciarla.',
      );
    }
  }

  /** Detener es idempotente y nunca modifica suscripciones de otras conexiones. */
  stop(
    viewerId: string,
    payload: unknown,
  ): { sensorId: string; state: 'stopped' } {
    const dto = validateMessage(SensorSubscriptionDto, payload);
    this.sessions.unsubscribe(viewerId, dto.sensorId);
    return { sensorId: dto.sensorId, state: 'stopped' };
  }

  /** Procesa mensajes pequeños y ordenados del equipo, con credencial y propiedad verificadas. */
  async deviceMessage(
    controllerId: string,
    connectionId: string,
    payload: unknown,
  ): Promise<void> {
    const device = this.devices.get(controllerId);
    if (!device || device.connectionId !== connectionId)
      throw new UnauthorizedException('Conexión de equipo no vigente.');
    await this.credentials.verifyIdentity(device.identity);
    if (!payload || typeof payload !== 'object' || Array.isArray(payload))
      throw new BadRequestException('Mensaje inválido.');
    if ((payload as { type?: unknown }).type === 'monitoring.ack') {
      const ack = validateMessage(MonitoringAckDto, payload);
      this.sessions.acknowledge(
        controllerId,
        ack.sensorId,
        ack.requestId,
        ack.accepted,
        ack.intervalMs,
      );
      return;
    }
    const dto = validateMessage(LiveReadingDto, payload);
    const event = await this.credentials.withController(
      device.identity,
      async (controller, manager) => {
        const sensor = await manager.findOneBy(SensorEntity, {
          id: dto.sensorId,
          controllerId: controller.id,
        });
        if (!sensor)
          throw new BadRequestException(
            'El sensor no pertenece al controlador.',
          );
        const measuredAt = validateSensorReading(sensor, dto);
        return {
          sensorId: sensor.id,
          controllerId,
          greenhouseId: controller.greenhouseId,
          type: sensor.type,
          unit: sensor.unit,
          requestId: dto.requestId,
          sequence: dto.sequence,
          readingId: dto.readingId,
          value: dto.value,
          measuredAt: measuredAt?.toISOString() ?? null,
          receivedAt: new Date().toISOString(),
        };
      },
    );
    const viewers = this.sessions.accept(
      controllerId,
      dto.sensorId,
      dto.requestId,
      dto.sequence,
    );
    await Promise.all(
      viewers.map(async (viewerId) => {
        try {
          await this.authorize(viewerId, dto.sensorId);
          if (this.sessions.watching(viewerId, dto.sensorId))
            this.viewers.get(viewerId)?.emit('monitoring.reading', event, true);
        } catch {
          this.disconnectViewer(viewerId);
        }
      }),
    );
  }

  /** Revalida conexiones silenciosas y vence concesiones; no acumula tareas si PostgreSQL tarda. */
  async sweep(): Promise<void> {
    if (this.sweeping) return;
    this.sweeping = true;
    try {
      await Promise.all(
        [...this.devices].map(async ([id, device]) => {
          try {
            await this.credentials.verifyIdentity(device.identity);
          } catch {
            this.removeDevice(id, device.connectionId);
            device.close();
          }
        }),
      );
      await Promise.all(
        [...this.viewers].map(async ([id, viewer]) => {
          try {
            await this.auth.authenticate(viewer.token);
            for (const sensorId of this.sessions.sensors(id))
              await this.authorize(id, sensorId);
          } catch {
            this.disconnectViewer(id);
          }
        }),
      );
      this.sessions.tick();
    } finally {
      this.sweeping = false;
    }
  }

  /** Detiene órdenes y libera conexiones al apagar la aplicación. */
  close(): void {
    this.sessions.close();
    for (const [id] of [...this.viewers]) this.disconnectViewer(id);
    for (const [id, device] of [...this.devices]) {
      this.devices.delete(id);
      device.close();
    }
  }

  /** Revalida JWT y pertenencia persistente; comprueba que la conexión sigue vigente tras consultar. */
  private async authorize(
    viewerId: string,
    sensorId: string,
  ): Promise<SensorEntity> {
    const viewer = this.viewers.get(viewerId);
    if (!viewer)
      throw new UnauthorizedException('Conexión de usuario no vigente.');
    const { user } = await this.auth.authenticate(viewer.token);
    const sensor = await this.access.sensor(user, sensorId);
    // Una consulta PostgreSQL puede terminar después de logout o de un cambio de rol.
    const current = await this.auth.authenticate(viewer.token);
    if (current.user.id !== user.id)
      throw new UnauthorizedException('La identidad del usuario cambió.');
    if (this.viewers.get(viewerId) !== viewer)
      throw new UnauthorizedException('La conexión se cerró.');
    return sensor;
  }

  private disconnectViewer(id: string): void {
    const viewer = this.viewers.get(id);
    this.removeViewer(id);
    viewer?.close();
  }
}
