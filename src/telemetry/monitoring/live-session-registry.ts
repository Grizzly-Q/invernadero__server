import { randomUUID } from 'node:crypto';

export const LIVE_LEASE_MS = 60000;
export const LIVE_ACK_MS = 5000;
export const LIVE_REFRESH_MS = 20000;

/** Orden efímera; el firmware debe usar un reloj monotónico para hacer cumplir su duración. */
export interface DeviceCommand {
  type: 'monitoring.start' | 'monitoring.stop';
  requestId: string;
  sensorId: string;
  intervalMs?: number;
  durationSeconds?: number;
}

/** Estado visible sin claves ni datos internos del transporte. */
export interface LiveState {
  sensorId: string;
  state: 'starting' | 'active' | 'stopped';
  reason?: string;
  intervalMs?: number;
  expiresAt?: string;
}

interface Watcher {
  expiresAt: number;
  intervalMs: number;
}
interface Pending {
  requestId: string;
  intervalMs: number;
  sentAt: number;
}
interface Active extends Pending {
  appliedIntervalMs: number;
  sequence: number;
  lastReadingAt: number;
  startedAt: number;
}
interface Group {
  sensorId: string;
  controllerId: string;
  watchers: Map<string, Watcher>;
  pending?: Pending;
  active?: Active;
  lastCommandAt: number;
}

/** Máquina de estados por sensor, independiente de sockets y base de datos, con reloj inyectable. */
export class LiveSessionRegistry {
  private readonly groups = new Map<string, Group>();

  constructor(
    private readonly send: (
      controllerId: string,
      command: DeviceCommand,
    ) => boolean,
    private readonly state: (viewerId: string, state: LiveState) => void,
    private readonly now: () => number = Date.now,
  ) {}

  /** Añade un espectador por 60 segundos y comparte la frecuencia más rápida solicitada. */
  subscribe(
    viewerId: string,
    sensorId: string,
    controllerId: string,
    intervalMs: number,
  ): LiveState {
    if (!this.groups.has(sensorId) && this.groups.size >= 1000)
      throw new Error('Se alcanzó el límite de sensores en vivo.');
    if (
      !this.groups.get(sensorId)?.watchers.has(viewerId) &&
      this.subscriptions(viewerId) >= 3
    )
      throw new Error(
        'Cada conexión puede observar como máximo tres sensores.',
      );
    const group = this.groups.get(sensorId) ?? {
      sensorId,
      controllerId,
      watchers: new Map<string, Watcher>(),
      lastCommandAt: 0,
    };
    this.groups.set(sensorId, group);
    group.watchers.set(viewerId, {
      expiresAt: this.now() + LIVE_LEASE_MS,
      intervalMs,
    });
    this.reconcile(group);
    const result = this.snapshot(group, viewerId);
    if (this.groups.has(sensorId)) this.state(viewerId, result);
    return this.groups.has(sensorId)
      ? result
      : { sensorId, state: 'stopped', reason: 'device_offline' };
  }

  /** Renueva solo una suscripción existente de esa conexión; no permite crearla implícitamente. */
  renew(viewerId: string, sensorId: string): LiveState {
    const group = this.groups.get(sensorId);
    const watcher = group?.watchers.get(viewerId);
    if (!group || !watcher || watcher.expiresAt <= this.now())
      throw new Error('La suscripción venció o no existe.');
    watcher.expiresAt = this.now() + LIVE_LEASE_MS;
    return this.snapshot(group, viewerId);
  }

  /** Retira únicamente al espectador indicado y detiene el equipo al salir el último. */
  unsubscribe(
    viewerId: string,
    sensorId: string,
    reason = 'user_stopped',
  ): void {
    const group = this.groups.get(sensorId);
    if (!group?.watchers.delete(viewerId)) return;
    this.state(viewerId, { sensorId, state: 'stopped', reason });
    if (!group.watchers.size) this.finish(group, reason);
    else this.reconcile(group);
  }

  /** Elimina todas las suscripciones de una conexión cerrada o no autorizada. */
  removeViewer(viewerId: string, reason = 'disconnected'): void {
    for (const group of [...this.groups.values()])
      this.unsubscribe(viewerId, group.sensorId, reason);
  }

  /** Una desconexión del ESP32 finaliza los flujos; reconectar no reactiva órdenes antiguas. */
  removeDevice(controllerId: string): void {
    for (const group of [...this.groups.values()])
      if (group.controllerId === controllerId)
        this.finish(group, 'device_offline');
  }

  /** Confirma únicamente la última orden del sensor y acepta una frecuencia más lenta que la solicitada. */
  acknowledge(
    controllerId: string,
    sensorId: string,
    requestId: string,
    accepted: boolean,
    appliedIntervalMs?: number,
  ): void {
    const group = this.groups.get(sensorId);
    if (
      !group ||
      group.controllerId !== controllerId ||
      group.pending?.requestId !== requestId
    )
      return;
    if (
      !accepted ||
      !appliedIntervalMs ||
      appliedIntervalMs < group.pending.intervalMs ||
      appliedIntervalMs > 30000
    ) {
      this.finish(group, 'sensor_unsupported');
      return;
    }
    if (this.now() - group.pending.sentAt >= LIVE_ACK_MS) {
      this.finish(group, 'ack_timeout');
      return;
    }
    group.active = {
      ...group.pending,
      appliedIntervalMs,
      sequence: -1,
      lastReadingAt: group.active?.lastReadingAt ?? -Infinity,
      startedAt: group.active?.startedAt ?? this.now(),
    };
    group.pending = undefined;
    for (const viewerId of group.watchers.keys())
      this.state(viewerId, this.snapshot(group, viewerId));
  }

  /** Descarta lecturas sin confirmación, de otra orden, repetidas o más rápidas que la frecuencia acordada. */
  accept(
    controllerId: string,
    sensorId: string,
    requestId: string,
    sequence: number,
  ): string[] {
    const group = this.groups.get(sensorId);
    const active = group?.active;
    if (
      !group ||
      group.controllerId !== controllerId ||
      !active ||
      active.requestId !== requestId ||
      sequence <= active.sequence ||
      this.now() - active.lastReadingAt < active.appliedIntervalMs * 0.8
    )
      return [];
    active.sequence = sequence;
    active.lastReadingAt = this.now();
    return [...group.watchers]
      .filter(([, watcher]) => watcher.expiresAt > this.now())
      .map(([id]) => id);
  }

  /** Expira concesiones, exige confirmaciones y renueva órdenes solo mientras existan espectadores. */
  tick(): void {
    for (const group of [...this.groups.values()]) {
      for (const [viewerId, watcher] of [...group.watchers])
        if (watcher.expiresAt <= this.now())
          this.unsubscribe(viewerId, group.sensorId, 'lease_expired');
      if (!this.groups.has(group.sensorId)) continue;
      if (group.pending && this.now() - group.pending.sentAt >= LIVE_ACK_MS) {
        this.finish(group, 'ack_timeout');
        continue;
      }
      if (
        group.active &&
        this.now() -
          Math.max(group.active.startedAt, group.active.lastReadingAt) >
          Math.max(5000, group.active.appliedIntervalMs * 3)
      ) {
        this.finish(group, 'reading_timeout');
        continue;
      }
      this.reconcile(group);
    }
  }

  /** Enumera sensores para revalidar permisos de una conexión antes de renovar sus órdenes. */
  sensors(viewerId: string): string[] {
    return [...this.groups.values()]
      .filter((group) => group.watchers.has(viewerId))
      .map((group) => group.sensorId);
  }

  /** Evita entregar una lectura si la concesión venció mientras se consultaban permisos. */
  watching(viewerId: string, sensorId: string): boolean {
    return (
      (this.groups.get(sensorId)?.watchers.get(viewerId)?.expiresAt ?? 0) >
      this.now()
    );
  }

  /** Finaliza todas las órdenes al apagar el servidor. */
  close(): void {
    for (const group of [...this.groups.values()])
      this.finish(group, 'server_shutdown');
  }

  private subscriptions(viewerId: string): number {
    return this.sensors(viewerId).length;
  }

  /** Evita repetir órdenes por espectador y limita la renovación del firmware a cada 20 segundos. */
  private reconcile(group: Group): void {
    if (!group.watchers.size) return;
    const intervalMs = Math.min(
      ...[...group.watchers.values()].map((watcher) => watcher.intervalMs),
    );
    const requested = group.pending ?? group.active;
    if (
      requested &&
      requested.intervalMs === intervalMs &&
      this.now() - group.lastCommandAt < LIVE_REFRESH_MS
    )
      return;
    const pending = { requestId: randomUUID(), intervalMs, sentAt: this.now() };
    group.pending = pending;
    group.lastCommandAt = this.now();
    if (
      !this.send(group.controllerId, {
        type: 'monitoring.start',
        requestId: pending.requestId,
        sensorId: group.sensorId,
        intervalMs,
        durationSeconds: LIVE_LEASE_MS / 1000,
      })
    )
      this.finish(group, 'device_offline');
  }

  private snapshot(group: Group, viewerId: string): LiveState {
    return {
      sensorId: group.sensorId,
      state: group.active ? 'active' : 'starting',
      intervalMs: group.active?.appliedIntervalMs,
      expiresAt: new Date(
        group.watchers.get(viewerId)!.expiresAt,
      ).toISOString(),
    };
  }

  /** Borra primero el grupo para que una desconexión síncrona no vuelva a finalizarlo recursivamente. */
  private finish(group: Group, reason: string): void {
    this.groups.delete(group.sensorId);
    this.send(group.controllerId, {
      type: 'monitoring.stop',
      requestId: randomUUID(),
      sensorId: group.sensorId,
    });
    for (const viewerId of group.watchers.keys())
      this.state(viewerId, {
        sensorId: group.sensorId,
        state: 'stopped',
        reason,
      });
  }
}
