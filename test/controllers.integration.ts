import 'reflect-metadata';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { ConfigModule } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Throttle } from '@nestjs/throttler';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import type { App } from 'supertest/types';
import { DataSource } from 'typeorm';
import { AuthModule } from '../src/auth/auth.module';
import { TelemetryModule } from '../src/telemetry/telemetry.module';
import { ControllerCredentialsService } from '../src/controllers/controller-credentials.service';
import { ControllerIdentityController } from '../src/controllers/controllers.controller';
import type {
  IssuedControllerCredential,
  PublicController,
} from '../src/controllers/controller.types';
import { ControllerCredentialEntity } from '../src/controllers/entities/controller-credential.entity';
import { MeasurementEntity } from '../src/telemetry/entities/measurement.entity';
import { SensorEntity } from '../src/telemetry/entities/sensor.entity';
import { databaseOptions } from '../src/db/database-options';
import { configureApp } from '../src/configure-app';
import { createBaseline } from './helpers/baseline';

/**
 * Ejecuta el flujo HTTP completo con PostgreSQL real en un esquema desechable.
 * No imprime claves, no aprovisiona equipos reales y elimina únicamente su esquema de prueba.
 */
async function main(): Promise<void> {
  const url = process.env.CONTROLLER_TEST_DATABASE_URL;
  if (!url)
    throw new Error(
      'Configure CONTROLLER_TEST_DATABASE_URL para las pruebas HTTP.',
    );
  const schemaName = `prueba_controladores_${randomBytes(8).toString('hex')}`;
  const source = new DataSource({
    ...databaseOptions(url),
    schema: schemaName,
    logging: false,
  });
  let app: INestApplication<App> | undefined;
  let schemaCreated = false;
  await source.initialize();
  try {
    const runner = source.createQueryRunner();
    try {
      await runner.startTransaction();
      await createBaseline(runner, schemaName);
      await runner.commitTransaction();
      schemaCreated = true;
    } catch (error) {
      if (runner.isTransactionActive) await runner.rollbackTransaction();
      throw error;
    } finally {
      await runner.release();
    }
    await source.runMigrations();
    const schema = source.driver.escape(schemaName);
    await source.query(
      `INSERT INTO ${schema}."Invernadero" ("idInvernadero_Invernadero", "nombre_Invernadero", ubicacion, largo, ancho) VALUES (1, 'Prueba uno', 'Prueba', 1, 1), (2, 'Prueba dos', 'Prueba', 1, 1)`,
    );

    const module = await Test.createTestingModule({
      imports: [
        ConfigModule.forRoot({
          isGlobal: true,
          ignoreEnvFile: true,
          load: [
            () => ({
              ADMIN_EMAIL: 'admin-prueba@example.com',
              ADMIN_PASSWORD: 'Prueba-admin-segura-123',
              auth: {
                secret: 'secreto-exclusivo-de-pruebas-con-32-bytes',
                issuer: 'prueba-api',
                audience: 'prueba-android',
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
    app = module.createNestApplication<INestApplication<App>>({
      logger: false,
    });
    configureApp(app);
    await app.init();
    const server = app.getHttpServer();
    const adminResponse = await request(server)
      .post('/auth/login')
      .send({
        email: 'admin-prueba@example.com',
        password: 'Prueba-admin-segura-123',
      })
      .expect(200);
    const admin = (adminResponse.body as { accessToken: string }).accessToken;
    const operatorResponse = await request(server)
      .post('/auth/register')
      .send({
        name: 'Operador de prueba',
        email: 'operador-prueba@example.com',
        password: 'Prueba-operador-segura-123',
      })
      .expect(201);
    const operator = (operatorResponse.body as { accessToken: string })
      .accessToken;
    const bearer = (token: string) => `Bearer ${token}`;
    await request(server).get('/controllers').expect(401);
    await request(server)
      .get('/controllers')
      .set('Authorization', bearer(operator))
      .expect(403);
    await request(server)
      .post('/controllers')
      .set('Authorization', bearer(operator))
      .send({ greenhouseId: '1', name: 'ESP32' })
      .expect(403);
    const created = await request(server)
      .post('/controllers')
      .set('Authorization', bearer(admin))
      .send({ greenhouseId: '1', name: 'ESP32 de prueba' })
      .expect(201)
      .expect('Cache-Control', 'no-store');
    const controller = created.body as PublicController;
    assert.equal(controller.active, false);
    await request(server)
      .post('/controllers')
      .set('Authorization', bearer(admin))
      .send({ greenhouseId: '1', name: 'Duplicado' })
      .expect(409);
    await request(server)
      .post('/controllers')
      .set('Authorization', bearer(admin))
      .send({ greenhouseId: '999', name: 'Inexistente' })
      .expect(404);
    await request(server)
      .patch(`/controllers/${controller.id}`)
      .set('Authorization', bearer(admin))
      .send({ active: true })
      .expect(400);
    await request(server)
      .post('/controllers')
      .set('Authorization', bearer(admin))
      .send({ greenhouseId: 1, name: 'Número inseguro' })
      .expect(400);
    await request(server)
      .get('/controllers?beforeId=9223372036854775808')
      .set('Authorization', bearer(admin))
      .expect(400);
    await request(server)
      .get('/controllers?unexpected=true')
      .set('Authorization', bearer(admin))
      .expect(400);

    const issue = await request(server)
      .post(`/controllers/${controller.id}/credentials`)
      .set('Authorization', bearer(admin))
      .send({})
      .expect(201)
      .expect('Cache-Control', 'no-store');
    const credential = issue.body as IssuedControllerCredential;
    assert.ok(/^esp32_[A-Za-z0-9_-]{43}$/.test(credential.credential));
    const hidden = await source
      .getRepository(ControllerCredentialEntity)
      .findOneByOrFail({ id: credential.id });
    assert.equal(
      hidden.credentialHash,
      undefined,
      'Los repositorios no deben seleccionar el hash por defecto.',
    );
    const stored = await source
      .getRepository(ControllerCredentialEntity)
      .createQueryBuilder('credential')
      .addSelect('credential.credentialHash')
      .where('credential.id = :id', { id: credential.id })
      .getOneOrFail();
    assert.ok(/^[0-9a-f]{64}$/.test(stored.credentialHash));
    assert.ok(stored.credentialHash !== credential.credential);
    assert.ok(!JSON.stringify(issue.body).includes('credentialHash'));
    await request(server)
      .get('/controllers/me')
      .set('Authorization', bearer(credential.credential))
      .expect(401);
    await request(server)
      .patch(`/controllers/${controller.id}`)
      .set('Authorization', bearer(admin))
      .send({ active: true })
      .expect(200);
    await request(server)
      .get('/controllers/me')
      .set('Authorization', bearer(credential.credential))
      .expect(200);
    await request(server)
      .get('/controllers/me')
      .set('Authorization', bearer(admin))
      .expect(401);
    await request(server)
      .get('/auth/me')
      .set('Authorization', bearer(credential.credential))
      .expect(401);
    await request(server)
      .get('/controllers')
      .set('Authorization', bearer(credential.credential))
      .expect(401);
    const listedCredentials = await request(server)
      .get(`/controllers/${controller.id}/credentials`)
      .set('Authorization', bearer(admin))
      .expect(200);
    assert.ok(
      !JSON.stringify(listedCredentials.body).includes(credential.credential),
    );
    assert.ok(
      !JSON.stringify(listedCredentials.body).includes(stored.credentialHash),
    );
    await request(server)
      .post(`/controllers/${controller.id}/credentials`)
      .set('Authorization', bearer(admin))
      .send({ expiresAt: '2000-01-01T00:00:00Z' })
      .expect(400);
    await request(server)
      .post(`/controllers/${controller.id}/credentials`)
      .set('Authorization', bearer(admin))
      .send({ expiresAt: '2099-01-01T00:00:00' })
      .expect(400);
    await request(server)
      .post(`/controllers/${controller.id}/credentials`)
      .set('Authorization', bearer(admin))
      .send({ hashCredencial: 'no-admitido' })
      .expect(400);
    await request(server)
      .post('/controllers/9223372036854775808/credentials')
      .set('Authorization', bearer(admin))
      .send({})
      .expect(400);

    const sensorResponse = await request(server)
      .post(`/controllers/${controller.id}/sensors`)
      .set('Authorization', bearer(admin))
      .send({ type: 'HumedadSuelo', unit: '%' })
      .expect(201);
    const sensor = sensorResponse.body as SensorEntity;
    await request(server)
      .post(`/controllers/${controller.id}/sensors`)
      .set('Authorization', bearer(admin))
      .send({ type: 'HumedadSuelo', unit: '%' })
      .expect(409);
    await request(server)
      .post(`/controllers/${controller.id}/sensors`)
      .set('Authorization', bearer(admin))
      .send({ type: 'Temperatura', unit: 'C' })
      .expect(400);
    await request(server)
      .get(`/controllers/${controller.id}/sensors`)
      .set('Authorization', bearer(admin))
      .expect(200);
    const second = await request(server)
      .post('/controllers')
      .set('Authorization', bearer(admin))
      .send({ greenhouseId: '2', name: 'Otro ESP32' })
      .expect(201);
    const secondId = (second.body as PublicController).id;
    const foreignSensor = await request(server)
      .post(`/controllers/${secondId}/sensors`)
      .set('Authorization', bearer(admin))
      .send({ type: 'HumedadSuelo', unit: '%' })
      .expect(201);
    const foreignId = (foreignSensor.body as SensorEntity).id;
    const reading = {
      sensorId: sensor.id,
      readingId: 'arranque-unico:1',
      measuredAt: '2026-10-23T10:30:00-05:00',
      value: 48.5,
    };
    const send = (readings: unknown[], token = credential.credential) =>
      request(server)
        .post('/telemetry')
        .set('Authorization', bearer(token))
        .send({ readings });
    await request(server)
      .post('/telemetry')
      .send({ readings: [reading] })
      .expect(401);
    await send([reading], admin).expect(401);
    const accepted = await send([reading]).expect(200);
    assert.equal((accepted.body as { inserted: number }).inserted, 1);
    const measured = await source
      .getRepository(MeasurementEntity)
      .findOneByOrFail({ sensorId: sensor.id, readingId: reading.readingId });
    assert.equal(
      measured.measuredAt?.toISOString(),
      '2026-10-23T15:30:00.000Z',
    );
    assert.equal(measured.value, '48.50');
    assert.ok(measured.receivedAt instanceof Date);
    const retried = await send([reading]).expect(200);
    assert.equal((retried.body as { duplicates: number }).duplicates, 1);
    const unchanged = await source
      .getRepository(MeasurementEntity)
      .findOneByOrFail({ id: measured.id });
    assert.equal(
      unchanged.receivedAt?.getTime(),
      measured.receivedAt?.getTime(),
    );
    await send([{ ...reading, value: 49 }]).expect(409);
    await send([{ ...reading, sensorId: foreignId }]).expect(403);
    await send([
      { ...reading, readingId: 'atomica' },
      { ...reading, sensorId: foreignId, readingId: 'atomica-ajena' },
    ]).expect(403);
    assert.equal(
      await source
        .getRepository(MeasurementEntity)
        .countBy({ readingId: 'atomica' }),
      0,
    );
    for (const invalid of [
      { ...reading, value: 101 },
      { ...reading, value: -1 },
      { ...reading, value: 1.234 },
      { ...reading, receivedAt: '2000-01-01T00:00:00Z' },
      { ...reading, controllerId: secondId },
      { ...reading, measuredAt: '2099-01-01T00:00:00Z' },
      { ...reading, measuredAt: '2026-10-23T10:30:00' },
      { ...reading, readingId: 'historica:1' },
      { ...reading, sensorId: Number(sensor.id) },
    ])
      await send([invalid]).expect(400);
    await send([]).expect(400);
    await send([reading, reading]).expect(400);
    await send(
      Array.from({ length: 101 }, (_, index) => ({
        ...reading,
        readingId: `exceso:${index}`,
      })),
    ).expect(400);
    await send([
      { sensorId: sensor.id, readingId: 'sin-reloj', value: 50 },
    ]).expect(200);
    const withoutClock = await source
      .getRepository(MeasurementEntity)
      .findOneByOrFail({ readingId: 'sin-reloj' });
    assert.equal(withoutClock.measuredAt, null);
    const concurrent = await Promise.all([
      send([{ ...reading, readingId: 'concurrente' }]),
      send([{ ...reading, readingId: 'concurrente' }]),
    ]);
    assert.ok(concurrent.every((response) => response.status === 200));
    assert.equal(
      await source
        .getRepository(MeasurementEntity)
        .countBy({ readingId: 'concurrente' }),
      1,
    );

    const credentialsService = app.get(ControllerCredentialsService);
    const identityBeforeRotation = await credentialsService.authenticate(
      credential.credential,
    );
    const rotatedResponse = await request(server)
      .post(`/controllers/${controller.id}/credentials/rotate`)
      .set('Authorization', bearer(admin))
      .send({})
      .expect(201);
    const rotated = rotatedResponse.body as IssuedControllerCredential;
    assert.ok(rotated.credential !== credential.credential);
    await request(server)
      .get('/controllers/me')
      .set('Authorization', bearer(credential.credential))
      .expect(401);
    await assert.rejects(
      () =>
        credentialsService.withController(identityBeforeRotation, () => true),
      /inválida o no autorizada/,
    );
    await request(server)
      .get('/controllers/me')
      .set('Authorization', bearer(rotated.credential))
      .expect(200);
    await request(server)
      .delete(`/controllers/${secondId}/credentials/${rotated.id}`)
      .set('Authorization', bearer(admin))
      .expect(404);
    await request(server)
      .patch(`/controllers/${controller.id}`)
      .set('Authorization', bearer(admin))
      .send({ active: false })
      .expect(200);
    await request(server)
      .get('/controllers/me')
      .set('Authorization', bearer(rotated.credential))
      .expect(401);
    await request(server)
      .patch(`/controllers/${controller.id}`)
      .set('Authorization', bearer(admin))
      .send({ active: true })
      .expect(200);
    await request(server)
      .delete(`/controllers/${controller.id}/credentials/${rotated.id}`)
      .set('Authorization', bearer(admin))
      .expect(204);
    await request(server)
      .delete(`/controllers/${controller.id}/credentials/${rotated.id}`)
      .set('Authorization', bearer(admin))
      .expect(204);
    await request(server)
      .get('/controllers/me')
      .set('Authorization', bearer(rotated.credential))
      .expect(401);
    const expiring = await credentialsService.issue(
      controller.id,
      '2099-01-01T00:00:00Z',
    );
    await source.getRepository(ControllerCredentialEntity).update(expiring.id, {
      createdAt: new Date('2000-01-01T00:00:00Z'),
      expiresAt: new Date('2000-01-02T00:00:00Z'),
    });
    await request(server)
      .get('/controllers/me')
      .set('Authorization', bearer(expiring.credential))
      .expect(401);
    // Simula direcciones distintas para comprobar que el límite por equipo no depende de la IP.
    const adapter = app.getHttpAdapter().getInstance() as {
      set(name: string, value: boolean): void;
    };
    adapter.set('trust proxy', true);
    const descriptor = Object.getOwnPropertyDescriptor(
      ControllerIdentityController.prototype,
      'me',
    )!;
    Throttle({ default: { limit: 2, ttl: 60000 } })(
      ControllerIdentityController.prototype,
      'me',
      descriptor,
    );
    const limited = await credentialsService.issue(secondId);
    await request(server)
      .patch(`/controllers/${secondId}`)
      .set('Authorization', bearer(admin))
      .send({ active: true })
      .expect(200);
    for (let index = 1; index <= 3; index++) {
      await request(server)
        .get('/controllers/me')
        .set('Authorization', bearer(limited.credential))
        .set('X-Forwarded-For', `198.51.100.${index}`)
        .expect(index <= 2 ? 200 : 429);
    }
    // Los intentos sin clave válida también quedan limitados por IP antes de autenticar.
    for (let index = 1; index <= 3; index++) {
      await request(server)
        .get('/controllers/me')
        .set('Authorization', 'Bearer clave-invalida')
        .set('X-Forwarded-For', '198.51.100.200')
        .expect(index <= 2 ? 401 : 429);
    }
    Throttle({ default: { limit: 60, ttl: 60000 } })(
      ControllerIdentityController.prototype,
      'me',
      descriptor,
    );
    console.log(
      'API verificada: administración, claves no recuperables, JWT separado, activación, vencimiento, rotación, revocación, sensores propios y telemetría atómica sin duplicados.',
    );
  } finally {
    await app?.close();
    if (schemaCreated) {
      // Solo se admite eliminar el esquema aleatorio creado por esta ejecución.
      assert.match(schemaName, /^prueba_controladores_[0-9a-f]{16}$/);
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
    error instanceof Error
      ? error.message
      : 'Falló la prueba HTTP de controladores.',
  );
  process.exitCode = 1;
});
