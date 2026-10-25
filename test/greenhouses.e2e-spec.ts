import type { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import request from 'supertest';
import type { Server } from 'node:http';
import { AppModule } from '../src/app.module';
import { configureApp } from '../src/configure-app';
import { authDatabase } from './helpers/auth-database';

/** Verifica cuentas, pertenencias y aislamiento completos en un esquema PostgreSQL desechable. */
// La preparación utiliza consultas reales y puede incluir latencia de la base remota.
jest.setTimeout(180000);

(process.env.AUTH_TEST_DATABASE_URL ? describe : describe.skip)(
  'Invernaderos: flujo de negocio completo',
  () => {
    let app: INestApplication;
    let database: Awaited<ReturnType<typeof authDatabase>>;
    let original: NodeJS.ProcessEnv;
    let server: Server;
    beforeAll(async () => {
      original = { ...process.env };
      process.env.DATABASE_URL = process.env.AUTH_TEST_DATABASE_URL!;
      process.env.JWT_SECRET = 'secreto-exclusivo-de-pruebas-con-32-bytes';
      database = await authDatabase(process.env.AUTH_TEST_DATABASE_URL!);
      const module = await Test.createTestingModule({ imports: [AppModule] })
        .overrideProvider(DataSource)
        .useValue(database.source)
        .compile();
      app = module.createNestApplication();
      configureApp(app);
      await app.init();
      server = app.getHttpServer() as Server;
    });
    afterAll(async () => {
      if (database?.source.isInitialized)
        await database.source.query(
          `DROP SCHEMA ${database.source.driver.escape(database.schema)} CASCADE`,
        );
      await app?.close();
      if (database?.source.isInitialized) await database.source.destroy();
      process.env = original;
    });
    it('registra, crea como ADMIN y permite operar solo en los invernaderos propios', async () => {
      const register = async (name: string) => {
        const response = await request(server)
          .post('/auth/register')
          .send({
            name,
            email: `${name}@example.com`,
            password: 'Clave-segura-123',
          })
          .expect(201);
        return response.body as { accessToken: string; user: { id: string } };
      };
      const ana = await register('ana');
      const luis = await register('luis');
      const auth = (token: string) => `Bearer ${token}`;
      const dto = { name: 'Cultivo', location: 'Lima', length: 10, width: 5 };
      const created = await request(server)
        .post('/greenhouses')
        .set('Authorization', auth(ana.accessToken))
        .send(dto)
        .expect(201);
      const id = (created.body as { id: string; role: string }).id;
      expect((created.body as { role: string }).role).toBe('ADMIN');
      await request(server)
        .get(`/greenhouses/${id}`)
        .set('Authorization', auth(luis.accessToken))
        .expect(403);
      const empty = await request(server)
        .get('/greenhouses')
        .set('Authorization', auth(luis.accessToken))
        .expect(200);
      expect((empty.body as { items: unknown[] }).items).toEqual([]);
      await database.source.query(
        `INSERT INTO ${database.source.driver.escape(database.schema)}."UsuarioInvernadero" ("idUsuario_UsuarioInvernadero", "idInvernadero_UsuarioInvernadero", "rol_UsuarioInvernadero") SELECT "idUsuario_Usuario", $1, 'OPERATOR' FROM ${database.source.driver.escape(database.schema)}."Usuario" WHERE "uuid_Usuario" = $2`,
        [id, luis.user.id],
      );
      const view = await request(server)
        .get(`/greenhouses/${id}`)
        .set('Authorization', auth(luis.accessToken))
        .expect(200);
      expect((view.body as { role: string }).role).toBe('OPERATOR');
      await request(server)
        .get(`/greenhouses/${id}/members`)
        .set('Authorization', auth(luis.accessToken))
        .expect(403);
      await request(server)
        .post('/controllers')
        .set('Authorization', auth(luis.accessToken))
        .send({ greenhouseId: id, name: 'ESP32' })
        .expect(403);
      await request(server)
        .post('/controllers')
        .set('Authorization', auth(ana.accessToken))
        .send({ greenhouseId: id, name: 'ESP32' })
        .expect(201);
      const own = await request(server)
        .post('/greenhouses')
        .set('Authorization', auth(luis.accessToken))
        .send(dto)
        .expect(201);
      expect((own.body as { role: string }).role).toBe('ADMIN');
      const memberships = await request(server)
        .get('/greenhouses')
        .set('Authorization', auth(luis.accessToken))
        .expect(200);
      expect(
        (memberships.body as { items: Array<{ role: string }> }).items
          .map((item: { role: string }) => item.role)
          .sort(),
      ).toEqual(['ADMIN', 'OPERATOR']);
      await request(server)
        .get(`/greenhouses/${(own.body as { id: string }).id}/members`)
        .set('Authorization', auth(ana.accessToken))
        .expect(403);
      await request(server)
        .post('/greenhouses')
        .set('Authorization', auth(ana.accessToken))
        .send({ ...dto, role: 'ADMIN' })
        .expect(400);
    });
  },
);
