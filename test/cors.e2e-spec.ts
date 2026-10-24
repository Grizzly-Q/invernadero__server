import 'reflect-metadata';
import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import type { Server } from 'node:http';
import { AppController } from '../src/app.controller';
import { AppService } from '../src/app.service';
import { configureApp } from '../src/configure-app';

describe('CORS para React local', () => {
  let app: INestApplication;
  let server: Server;

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [AppController],
      providers: [AppService],
    }).compile();
    app = module.createNestApplication();
    configureApp(app);
    await app.init();
    server = app.getHttpServer() as Server;
  });

  afterAll(async () => {
    await app.close();
  });

  it('permite el preflight de React con JWT y JSON sin habilitar cookies', async () => {
    const response = await request(server)
      .options('/telemetry/sensors/1/history')
      .set('Origin', 'http://localhost:5173')
      .set('Access-Control-Request-Method', 'GET')
      .set('Access-Control-Request-Headers', 'authorization,content-type')
      .expect(204);
    expect(response.headers['access-control-allow-origin']).toBe(
      'http://localhost:5173',
    );
    expect(response.headers['access-control-allow-headers']).toBe(
      'Authorization,Content-Type',
    );
    expect(
      response.headers['access-control-allow-credentials'],
    ).toBeUndefined();
  });

  it('incluye el permiso de origen en la respuesta HTTP', async () => {
    await request(server)
      .get('/')
      .set('Origin', 'http://localhost:5173')
      .expect('Access-Control-Allow-Origin', 'http://localhost:5173')
      .expect(200);
  });

  it('no autoriza otros orígenes en las cabeceras CORS', async () => {
    const response = await request(server)
      .get('/')
      .set('Origin', 'http://otro-origen.example')
      .expect(200);
    expect(response.headers['access-control-allow-origin']).toBeUndefined();
  });
});
