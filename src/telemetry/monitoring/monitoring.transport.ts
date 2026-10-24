import { HttpException, Injectable } from '@nestjs/common';
import type { OnApplicationBootstrap, OnModuleDestroy } from '@nestjs/common';
import { HttpAdapterHost } from '@nestjs/core';
import type { IncomingMessage, Server as HttpServer } from 'node:http';
import type { Duplex } from 'node:stream';
import { Server as SocketServer } from 'socket.io';
import { WebSocket, WebSocketServer } from 'ws';
import { ControllerCredentialsService } from '../../controllers/controller-credentials.service';
import { MonitoringService } from './monitoring.service';

/** Cuota pequeña para handshakes y mensajes; no registra credenciales ni carga de paquetes. */
class WindowQuota {
  private readonly entries = new Map<
    string,
    { since: number; count: number }
  >();

  /** Devuelve false al exceder la cuota; acota también el número de claves almacenadas. */
  allow(key: string, limit: number, windowMs: number): boolean {
    const now = Date.now();
    for (const [id, entry] of this.entries)
      if (now - entry.since >= windowMs) this.entries.delete(id);
    const entry = this.entries.get(key) ?? { since: now, count: 0 };
    if (!this.entries.has(key) && this.entries.size >= 2048) return false;
    this.entries.set(key, entry);
    return ++entry.count <= limit;
  }

  remove(key: string): void {
    this.entries.delete(key);
  }
}

/** Dos protocolos en el mismo servidor: WebSocket para ESP32 y Socket.IO para Android. */
@Injectable()
export class MonitoringTransport
  implements OnApplicationBootstrap, OnModuleDestroy
{
  private io?: SocketServer;
  private boards?: WebSocketServer;
  private http?: HttpServer;
  private timer?: ReturnType<typeof setInterval>;
  private pendingBoards = 0;
  private readonly handshakeQuota = new WindowQuota();
  private readonly messageQuota = new WindowQuota();
  private readonly heartbeats = new Map<
    WebSocket,
    { alive: boolean; pingAt: number }
  >();
  private readonly upgrade = (
    request: IncomingMessage,
    socket: Duplex,
    head: Buffer,
  ): void => {
    void this.upgradeBoard(request, socket, head);
  };

  constructor(
    private readonly adapter: HttpAdapterHost,
    private readonly monitoring: MonitoringService,
    private readonly credentials: ControllerCredentialsService,
  ) {}

  /** Adjunta transportes al servidor de Nest después de inicializar las rutas HTTP. */
  onApplicationBootstrap(): void {
    this.http = this.adapter.httpAdapter.getHttpServer() as HttpServer;
    this.boards = new WebSocketServer({
      noServer: true,
      maxPayload: 8192,
      perMessageDeflate: false,
    });
    this.io = new SocketServer(this.http, {
      transports: ['websocket'],
      serveClient: false,
      maxHttpBufferSize: 8192,
      pingInterval: 20000,
      pingTimeout: 10000,
      allowRequest: (request, next) =>
        next(
          null,
          this.handshakeQuota.allow(
            request.socket.remoteAddress ?? 'unknown',
            60,
            60000,
          ),
        ),
    });
    this.io
      .of('/')
      .use((_socket, next) => next(new Error('Use el namespace /monitoring.')));
    const namespace = this.io.of('/monitoring');
    namespace.use((socket, next) => {
      const suppliedAuth: unknown = socket.handshake.auth;
      const token =
        suppliedAuth &&
        typeof suppliedAuth === 'object' &&
        !Array.isArray(suppliedAuth)
          ? (suppliedAuth as { token?: unknown }).token
          : undefined;
      if (typeof token !== 'string' || !token || token.length > 2048) {
        next(new Error('JWT de usuario requerido.'));
        return;
      }
      void this.monitoring
        .addViewer(
          socket.id,
          token,
          (event, payload, volatile) => {
            if (volatile) socket.volatile.emit(event, payload);
            else socket.emit(event, payload);
          },
          () => socket.disconnect(true),
        )
        .then(() => {
          if (socket.conn.readyState !== 'open') {
            this.monitoring.removeViewer(socket.id);
            next(new Error('Conexión cerrada.'));
          } else next();
        })
        .catch(() =>
          next(new Error('Sesión no autorizada o capacidad agotada.')),
        );
    });
    namespace.on('connection', (socket) => {
      let queue = Promise.resolve();
      let queued = 0;
      const handlers = {
        'monitoring.start': (payload: unknown) =>
          this.monitoring.start(socket.id, payload),
        'monitoring.renew': (payload: unknown) =>
          this.monitoring.renew(socket.id, payload),
        'monitoring.stop': (payload: unknown) =>
          this.monitoring.stop(socket.id, payload),
      };
      for (const [event, handler] of Object.entries(handlers)) {
        socket.on(event, (payload: unknown, ack?: unknown) => {
          if (!this.messageQuota.allow(socket.id, 20, 10000) || queued >= 8) {
            socket.disconnect(true);
            return;
          }
          queued++;
          queue = queue
            .then(async () => {
              if (!socket.connected) return;
              try {
                const data = await handler(payload);
                if (typeof ack === 'function')
                  (ack as (result: unknown) => void)({ ok: true, data });
              } catch (error) {
                const status =
                  error instanceof HttpException ? error.getStatus() : 400;
                const response = {
                  ok: false,
                  error: {
                    status,
                    message:
                      error instanceof HttpException
                        ? error.message
                        : 'No se pudo completar la suscripción.',
                  },
                };
                if (typeof ack === 'function')
                  (ack as (result: unknown) => void)(response);
                else socket.emit('monitoring.error', response.error);
                if (status === 401) socket.disconnect(true);
              }
            })
            .finally(() => {
              queued--;
            });
        });
      }
      socket.on('disconnect', () => {
        this.messageQuota.remove(socket.id);
        this.monitoring.removeViewer(socket.id);
      });
    });
    this.http.on('upgrade', this.upgrade);
    this.timer = setInterval(() => {
      void this.monitoring.sweep().catch(() => {
        /* Un fallo operativo se vuelve a comprobar sin registrar secretos. */
      });
      for (const [socket, heartbeat] of this.heartbeats) {
        if (Date.now() - heartbeat.pingAt < 20000) continue;
        if (!heartbeat.alive) {
          socket.terminate();
          continue;
        }
        heartbeat.alive = false;
        heartbeat.pingAt = Date.now();
        socket.ping();
      }
    }, 1000);
    this.timer.unref();
  }

  /** Cierra primero conexiones persistentes para que Nest pueda finalizar su servidor HTTP. */
  async onModuleDestroy(): Promise<void> {
    if (this.timer) clearInterval(this.timer);
    this.http?.off('upgrade', this.upgrade);
    this.monitoring.close();
    for (const client of this.boards?.clients ?? []) client.terminate();
    this.heartbeats.clear();
    if (this.io) await this.io.close();
    if (this.boards)
      await new Promise<void>((resolve) => this.boards!.close(() => resolve()));
  }

  /** Autentica el upgrade con Bearer; no acepta secretos en URL ni clientes sin identidad. */
  private async upgradeBoard(
    request: IncomingMessage,
    socket: Duplex,
    head: Buffer,
  ): Promise<void> {
    let path: URL;
    try {
      path = new URL(request.url ?? '/', 'http://localhost');
    } catch {
      socket.destroy();
      return;
    }
    if (path.pathname !== '/controllers/socket') return;
    socket.on('error', () => socket.destroy());
    if (this.pendingBoards >= 32) {
      socket.end(
        'HTTP/1.1 503 Service Unavailable\r\nConnection: close\r\nContent-Length: 0\r\n\r\n',
      );
      return;
    }
    this.pendingBoards++;
    try {
      const headers = request.rawHeaders.filter(
        (name, index) =>
          index % 2 === 0 && name.toLowerCase() === 'authorization',
      );
      const match = /^Bearer (esp32_[A-Za-z0-9_-]{43})$/.exec(
        request.headers.authorization ?? '',
      );
      if (
        path.search ||
        headers.length !== 1 ||
        !match ||
        !this.boards ||
        this.boards.clients.size >= 128 ||
        !this.handshakeQuota.allow(
          request.socket.remoteAddress ?? 'unknown',
          60,
          60000,
        )
      )
        throw new Error('No autorizado.');
      const identity = await this.credentials.authenticate(match[1]);
      if (socket.destroyed) return;
      this.boards.handleUpgrade(request, socket, head, (client) => {
        this.heartbeats.set(client, { alive: true, pingAt: Date.now() });
        client.on('pong', () => {
          const heartbeat = this.heartbeats.get(client);
          if (heartbeat) heartbeat.alive = true;
        });
        const ready = this.monitoring.addDevice(
          identity,
          (command) => {
            if (
              client.readyState !== WebSocket.OPEN ||
              client.bufferedAmount > 16384
            )
              return false;
            client.send(JSON.stringify(command));
            return true;
          },
          () => client.close(1008, 'Credencial o conexión no vigente.'),
        );
        let queue = Promise.resolve();
        let queued = 0;
        const rateKey = `board:${identity.id}`;
        client.on('message', (data, binary) => {
          if (
            binary ||
            queued >= 8 ||
            !this.messageQuota.allow(rateKey, 10, 1000)
          ) {
            client.close(1008, 'Mensaje o frecuencia inválidos.');
            return;
          }
          queued++;
          queue = queue
            .then(async () => {
              const connectionId = await ready;
              const buffer = Array.isArray(data)
                ? Buffer.concat(data)
                : Buffer.from(data as ArrayBuffer);
              await this.monitoring.deviceMessage(
                identity.id,
                connectionId,
                JSON.parse(buffer.toString('utf8')) as unknown,
              );
            })
            .catch(() => {
              client.close(1008, 'Mensaje no autorizado o inválido.');
            })
            .finally(() => {
              queued--;
            });
        });
        client.on('close', () => {
          this.heartbeats.delete(client);
          this.messageQuota.remove(rateKey);
          void ready
            .then((id) => this.monitoring.removeDevice(identity.id, id))
            .catch(() => undefined);
        });
        client.on('error', () => client.terminate());
        void ready
          .then(() => {
            if (client.readyState === WebSocket.OPEN)
              client.send(
                JSON.stringify({
                  type: 'monitoring.ready',
                  leaseSeconds: 60,
                  normalIntervalMs: 30000,
                }),
              );
          })
          .catch(() => client.close(1008, 'No autorizado.'));
      });
    } catch {
      if (!socket.destroyed)
        socket.end(
          'HTTP/1.1 401 Unauthorized\r\nConnection: close\r\nContent-Length: 0\r\n\r\n',
        );
    } finally {
      this.pendingBoards--;
    }
  }
}
