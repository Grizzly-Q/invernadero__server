import 'reflect-metadata';
import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import type { AddressInfo } from 'node:net';
import { setTimeout as delay } from 'node:timers/promises';
import type { INestApplication } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { TypeOrmModule } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import request from 'supertest';
import { io } from 'socket.io-client';
import type { Socket } from 'socket.io-client';
import { WebSocket } from 'ws';
import { AuthModule } from '../src/auth/auth.module';
import { TelemetryModule } from '../src/telemetry/telemetry.module';
import { MonitoringService } from '../src/telemetry/monitoring/monitoring.service';
import { ControllerCredentialsService } from '../src/controllers/controller-credentials.service';
import { ControllersService } from '../src/controllers/controllers.service';
import { ControllerEntity } from '../src/controllers/entities/controller.entity';
import { MeasurementEntity } from '../src/telemetry/entities/measurement.entity';
import { databaseOptions } from '../src/db/database-options';
import { configureApp } from '../src/configure-app';
import { createBaseline } from './helpers/baseline';
import { verifyHistory } from './helpers/history';
import type {
  DeviceCommand,
  LiveState,
} from '../src/telemetry/monitoring/live-session-registry';

/** Espera una condición de red con límite acotado y sin registrar paquetes que puedan contener secretos. */
async function until(condition: () => boolean, message: string): Promise<void> {
  const deadline = Date.now() + 6000;
  while (!condition()) {
    if (Date.now() >= deadline) throw new Error(message);
    await delay(20);
  }
}

/** Emula el firmware con confirmaciones y paquetes reales WebSocket. */
class Board {
  readonly commands: DeviceCommand[] = [];
  readonly socket: WebSocket;
  ready = false;
  reject = false;

  constructor(url: string, token: string) {
    this.socket = new WebSocket(url, {
      headers: { Authorization: `Bearer ${token}` },
    });
    this.socket.on('error', () => undefined);
    this.socket.on('message', (raw) => {
      const buffer = Array.isArray(raw)
        ? Buffer.concat(raw)
        : Buffer.from(raw as ArrayBuffer);
      const message = JSON.parse(buffer.toString('utf8')) as
        DeviceCommand | { type: 'monitoring.ready' };
      if (message.type === 'monitoring.ready') {
        this.ready = true;
        return;
      }
      this.commands.push(message);
      if (message.type === 'monitoring.start')
        this.socket.send(
          JSON.stringify({
            type: 'monitoring.ack',
            sensorId: message.sensorId,
            requestId: message.requestId,
            accepted: !this.reject,
            intervalMs: message.intervalMs,
          }),
        );
    });
  }

  /** Envía una lectura fresca asociada a la última orden de ese sensor. */
  sample(
    sensorId: string,
    sequence: number,
    value = 48.5,
    requestId?: string,
  ): void {
    const command = this.commands
      .filter(
        (item) =>
          item.type === 'monitoring.start' && item.sensorId === sensorId,
      )
      .at(-1)!;
    this.socket.send(
      JSON.stringify({
        type: 'monitoring.reading',
        sensorId,
        requestId: requestId ?? command.requestId,
        sequence,
        readingId: `prueba:${sequence}`,
        value,
        measuredAt: new Date().toISOString(),
      }),
    );
  }
}

/** Cliente de Android emulado con Socket.IO; conserva eventos para comprobar permisos y estados. */
class Viewer {
  readonly socket: Socket;
  readonly states: LiveState[] = [];
  readonly readings: Array<{
    sensorId: string;
    value: number;
    sequence: number;
  }> = [];

  constructor(url: string, token: string) {
    this.socket = io(`${url}/monitoring`, {
      transports: ['websocket'],
      auth: { token },
      reconnection: false,
    });
    this.socket.on('monitoring.state', (state: LiveState) =>
      this.states.push(state),
    );
    this.socket.on(
      'monitoring.reading',
      (reading: Viewer['readings'][number]) => this.readings.push(reading),
    );
  }

  /** Ejecuta una solicitud con confirmación limitada; nunca muestra el JWT en errores. */
  async command(
    event: string,
    payload: unknown,
  ): Promise<{ ok: boolean; data?: LiveState; error?: { status: number } }> {
    return (await this.socket.timeout(5000).emitWithAck(event, payload)) as {
      ok: boolean;
      data?: LiveState;
      error?: { status: number };
    };
  }
}

/** Comprueba WebSocket, Socket.IO, permisos y limpieza con PostgreSQL en un esquema desechable. */
async function main(): Promise<void> {
  const url = process.env.MONITORING_TEST_DATABASE_URL;
  if (!url) throw new Error('Configure MONITORING_TEST_DATABASE_URL.');
  const schemaName = `prueba_monitoreo_${randomBytes(8).toString('hex')}`;
  const source = new DataSource({
    ...databaseOptions(url),
    schema: schemaName,
    logging: false,
  });
  const viewers: Viewer[] = [];
  const boards: Board[] = [];
  let app: INestApplication | undefined;
  let created = false;
  await source.initialize();
  try {
    const runner = source.createQueryRunner();
    try {
      await runner.startTransaction();
      await createBaseline(runner, schemaName);
      await runner.commitTransaction();
      created = true;
    } catch (error) {
      if (runner.isTransactionActive) await runner.rollbackTransaction();
      throw error;
    } finally {
      await runner.release();
    }
    await source.runMigrations();
    const schema = source.driver.escape(schemaName);
    await source.query(
      `INSERT INTO ${schema}."Invernadero" ("idInvernadero_Invernadero", "nombre_Invernadero", ubicacion, largo, ancho) VALUES (1,'Prueba','Prueba',1,1),(2,'Otro','Prueba',1,1)`,
    );
    await source.query(
      `INSERT INTO ${schema}."Usuario" ("idUsuario_Usuario", "nombreUsuario", contrasena, rol) VALUES (1,'operador-ficticio','hash-ficticio','Operador')`,
    );
    await source.query(
      `INSERT INTO ${schema}."UsuarioInvernadero" ("idUsuario_UsuarioInvernadero", "idInvernadero_UsuarioInvernadero") VALUES (1,1)`,
    );
    const module = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          ignoreEnvFile: true,
          load: [
            () => ({
              ADMIN_EMAIL: 'admin-live@example.com',
              ADMIN_PASSWORD: 'Clave-ficticia-segura-123',
              auth: {
                secret: 'secreto-ficticio-exclusivo-de-pruebas-123',
                issuer: 'prueba',
                audience: 'prueba',
                accessTtl: 900,
              },
            }),
          ],
        }),
        TypeOrmModule.forRoot({ ...databaseOptions(url), schema: schemaName }),
        AuthModule,
        TelemetryModule,
      ],
    })
      .overrideProvider(DataSource)
      .useValue(source)
      .compile();
    app = module.createNestApplication({ logger: false });
    configureApp(app);
    await app.listen(0, '127.0.0.1');
    const http = app.getHttpServer() as import('node:http').Server;
    const address = http.address() as AddressInfo;
    const base = `http://127.0.0.1:${address.port}`;
    const boardUrl = `ws://127.0.0.1:${address.port}/controllers/socket`;
    const credentials = app.get(ControllerCredentialsService);
    const controllers = app.get(ControllersService);
    const monitoring = app.get(MonitoringService);
    const controller = await controllers.create({
      greenhouseId: '1',
      name: 'ESP32 ficticio',
    });
    const foreign = await controllers.create({
      greenhouseId: '2',
      name: 'ESP32 ajeno',
    });
    const sensor = await controllers.createSensor(controller.id, {
      type: 'HumedadSuelo',
      unit: '%',
    });
    const foreignSensor = await controllers.createSensor(foreign.id, {
      type: 'HumedadSuelo',
      unit: '%',
    });
    const issued = await credentials.issue(controller.id);
    await controllers.setActive(controller.id, true);
    const login = await request(http)
      .post('/auth/login')
      .send({
        email: 'admin-live@example.com',
        password: 'Clave-ficticia-segura-123',
      })
      .expect(200);
    const adminToken = (login.body as { accessToken: string }).accessToken;
    const registration = await request(http)
      .post('/auth/register')
      .send({
        name: 'Operador',
        email: 'op-live@example.com',
        password: 'Clave-ficticia-segura-123',
      })
      .expect(201);
    const operator = registration.body as {
      accessToken: string;
      user: { id: string };
    };
    const admin = new Viewer(base, adminToken);
    const op = new Viewer(base, operator.accessToken);
    viewers.push(admin, op);
    await until(
      () => admin.socket.connected && op.socket.connected,
      'No se conectaron los clientes Socket.IO.',
    );
    const board = new Board(boardUrl, issued.credential);
    boards.push(board);
    await until(() => board.ready, 'No se autenticó el ESP32.');
    const forbidden = await op.command('monitoring.start', {
      sensorId: sensor.id,
    });
    assert.equal(forbidden.error?.status, 403);
    await request(http)
      .put(`/monitoring/users/${operator.user.id}/database-identity`)
      .set('Authorization', `Bearer ${operator.accessToken}`)
      .send({ databaseUserId: '1' })
      .expect(403);
    await request(http)
      .put(`/monitoring/users/${operator.user.id}/database-identity`)
      .set('Authorization', `Bearer ${adminToken}`)
      .send({ databaseUserId: '1' })
      .expect(200);
    await verifyHistory(
      http,
      source,
      sensor.id,
      foreignSensor.id,
      operator.accessToken,
      issued.credential,
    );
    assert.equal(
      (await op.command('monitoring.start', { sensorId: foreignSensor.id }))
        .error?.status,
      403,
    );
    assert.equal(
      (
        await admin.command('monitoring.start', {
          sensorId: sensor.id,
          intervalMs: 100,
        })
      ).error?.status,
      400,
    );
    assert.equal(
      (await op.command('monitoring.start', { sensorId: sensor.id })).ok,
      true,
    );
    await until(
      () => op.states.some((state) => state.state === 'active'),
      'No llegó la confirmación del sensor.',
    );
    const startCount = board.commands.filter(
      (command) => command.type === 'monitoring.start',
    ).length;
    assert.equal(
      (await admin.command('monitoring.start', { sensorId: sensor.id })).ok,
      true,
    );
    assert.equal(
      board.commands.filter((command) => command.type === 'monitoring.start')
        .length,
      startCount,
    );
    board.sample(sensor.id, 0);
    await until(
      () => op.readings.length === 1 && admin.readings.length === 1,
      'No se compartió la lectura autorizada.',
    );
    board.sample(sensor.id, 0);
    board.sample(sensor.id, 1, 50, randomUUID());
    await delay(250);
    assert.equal(op.readings.length, 1);
    assert.equal(
      await source.getRepository(MeasurementEntity).count(),
      0,
      'El canal rápido no debe insertar historial.',
    );
    await op.command('monitoring.stop', { sensorId: sensor.id });
    assert.equal(
      board.commands.filter((command) => command.type === 'monitoring.stop')
        .length,
      0,
    );
    await admin.command('monitoring.stop', { sensorId: sensor.id });
    await until(
      () =>
        board.commands.some((command) => command.type === 'monitoring.stop'),
      'No se detuvo el último espectador.',
    );

    board.reject = true;
    await admin.command('monitoring.start', { sensorId: sensor.id });
    await until(
      () => admin.states.some((state) => state.reason === 'sensor_unsupported'),
      'No se informó rechazo del sensor.',
    );
    board.reject = false;
    await op.command('monitoring.start', { sensorId: sensor.id });
    await until(
      () =>
        board.commands.filter((command) => command.type === 'monitoring.start')
          .length >= 3,
      'No se reinició el flujo.',
    );
    await source.query(
      `DELETE FROM ${schema}."UsuarioInvernadero" WHERE "idUsuario_UsuarioInvernadero"=1`,
    );
    await monitoring.sweep();
    await until(
      () => !op.socket.connected,
      'La retirada de asignación no desconectó al Operador.',
    );

    await admin.command('monitoring.start', { sensorId: sensor.id });
    const replacement = await credentials.issue(controller.id, null, true);
    await monitoring.sweep();
    await until(
      () => board.socket.readyState === WebSocket.CLOSED,
      'La rotación no cerró la conexión anterior.',
    );
    const reconnected = new Board(boardUrl, replacement.credential);
    boards.push(reconnected);
    await until(
      () => reconnected.ready,
      'No se reconectó el equipo con su nueva clave.',
    );
    assert.equal(
      reconnected.commands.length,
      0,
      'Reconectar no debe revivir órdenes antiguas.',
    );
    assert.equal(
      (await admin.command('monitoring.renew', { sensorId: sensor.id })).error
        ?.status,
      400,
    );
    await admin.command('monitoring.start', { sensorId: sensor.id });
    await request(http)
      .post('/auth/logout')
      .set('Authorization', `Bearer ${adminToken}`)
      .expect(204);
    await monitoring.sweep();
    await until(() => !admin.socket.connected, 'Logout no cerró el monitoreo.');
    await until(
      () =>
        reconnected.commands.some(
          (command) => command.type === 'monitoring.stop',
        ),
      'Logout no retiró la orden del último espectador.',
    );

    const invalidViewer = new Viewer(base, issued.credential);
    viewers.push(invalidViewer);
    let rejected = false;
    invalidViewer.socket.on('connect_error', () => {
      rejected = true;
    });
    await until(
      () => rejected,
      'Se permitió una credencial de ESP32 como JWT.',
    );
    await source
      .getRepository(ControllerEntity)
      .update(controller.id, { active: false });
    await monitoring.sweep();
    await until(
      () => reconnected.socket.readyState === WebSocket.CLOSED,
      'El bloqueo no cerró la conexión del equipo.',
    );
    assert.equal(await source.getRepository(MeasurementEntity).count(), 0);
    console.log(
      'Monitoreo verificado: WebSocket y Socket.IO reales, permisos de asignación, espectadores compartidos, confirmación, reintentos, rotación, logout, bloqueo y ausencia de escrituras históricas.',
    );
  } finally {
    for (const viewer of viewers) viewer.socket.disconnect();
    for (const board of boards) board.socket.terminate();
    await app?.close();
    if (created) {
      assert.match(schemaName, /^prueba_monitoreo_[0-9a-f]{16}$/);
      if (!source.isInitialized) await source.initialize();
      await source.query(
        `DROP SCHEMA ${source.driver.escape(schemaName)} CASCADE`,
      );
    }
    if (source.isInitialized) await source.destroy();
  }
}

void main().catch((error: unknown) => {
  console.error(
    error instanceof Error ? error.message : 'Falló la prueba de monitoreo.',
  );
  process.exitCode = 1;
});
