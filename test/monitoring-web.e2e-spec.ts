import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { AddressInfo } from 'node:net';
import type { Server } from 'node:http';
import { io, type Socket } from 'socket.io-client';
import { MonitoringTransport } from '../src/telemetry/monitoring/monitoring.transport';
import { MonitoringService } from '../src/telemetry/monitoring/monitoring.service';
import { ControllerCredentialsService } from '../src/controllers/controller-credentials.service';

/** Handshake WebSocket real con autenticación simulada; no abre conexiones PostgreSQL ni modifica equipos. */
describe('Monitoreo Socket.IO: orígenes web y clientes nativos', () => {
  let app: INestApplication;
  let direccion: string;
  const sockets: Socket[] = [];
  const monitoring = {
    addViewer: jest.fn((_id: string, token: string) =>
      token === 'valido'
        ? Promise.resolve()
        : Promise.reject(new Error('No autorizado')),
    ),
    removeViewer: jest.fn(),
    sweep: jest.fn().mockResolvedValue(undefined),
    close: jest.fn(),
  };
  beforeAll(async () => {
    const module = await Test.createTestingModule({
      providers: [
        MonitoringTransport,
        { provide: MonitoringService, useValue: monitoring },
        { provide: ControllerCredentialsService, useValue: {} },
        {
          provide: ConfigService,
          useValue: new ConfigService({
            auth: { webOrigins: ['http://localhost:5173'] },
          }),
        },
      ],
    }).compile();
    app = module.createNestApplication({ logger: false });
    await app.listen(0, '127.0.0.1');
    const servidor = app.getHttpServer() as Server;
    direccion = `http://127.0.0.1:${(servidor.address() as AddressInfo).port}/monitoring`;
  });
  afterEach(() => {
    sockets.splice(0).forEach((socket) => socket.disconnect());
  });
  afterAll(async () => {
    await app.close();
  });

  function conectar(origin?: string, token?: string): Promise<boolean> {
    return new Promise((resolve) => {
      const socket = io(direccion, {
        transports: ['websocket'],
        reconnection: false,
        forceNew: true,
        timeout: 2000,
        ...(origin === undefined ? {} : { extraHeaders: { Origin: origin } }),
        auth: token ? { token } : {},
      });
      sockets.push(socket);
      socket.once('connect', () => resolve(true));
      socket.once('connect_error', () => resolve(false));
    });
  }
  it('acepta la web permitida con identidad autorizada', async () => {
    await expect(conectar('http://localhost:5173', 'valido')).resolves.toBe(
      true,
    );
  });
  it('rechaza una web ajena incluso si presenta un token', async () => {
    await expect(conectar('https://ajeno.test', 'valido')).resolves.toBe(false);
  });
  it('mantiene clientes nativos sin Origin', async () => {
    await expect(conectar(undefined, 'valido')).resolves.toBe(true);
  });
  it('no considera el origen permitido como autenticación', async () => {
    await expect(conectar('http://localhost:5173')).resolves.toBe(false);
  });
  it('tampoco admite un cliente nativo sin identidad', async () => {
    await expect(conectar()).resolves.toBe(false);
  });
});
