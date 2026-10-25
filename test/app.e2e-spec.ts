import { DataSource } from 'typeorm';
import { authDatabase } from './helpers/auth-database';
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import request from 'supertest';
import { App } from 'supertest/types';
import { AppModule } from './../src/app.module';
import { configureApp } from '../src/configure-app';

// La preparación utiliza consultas reales y puede incluir latencia de la base remota.
jest.setTimeout(180000);

(process.env.AUTH_TEST_DATABASE_URL ? describe : describe.skip)(
  'AppController (e2e)',
  () => {
    let app: INestApplication<App>;
    let originalEnvironment: NodeJS.ProcessEnv;
    let database: Awaited<ReturnType<typeof authDatabase>>;

    beforeEach(async () => {
      originalEnvironment = { ...process.env };
      process.env.DATABASE_URL = process.env.AUTH_TEST_DATABASE_URL!;
      database = await authDatabase(process.env.AUTH_TEST_DATABASE_URL!);
      process.env.JWT_SECRET = 'secreto-exclusivo-de-pruebas-con-32-bytes';
      const moduleFixture: TestingModule = await Test.createTestingModule({
        imports: [AppModule],
      })
        .overrideProvider(DataSource)
        .useValue(database.source)
        .compile();

      app = moduleFixture.createNestApplication();
      configureApp(app);
      await app.init();
    });

    it('/ (GET)', () => {
      return request(app.getHttpServer())
        .get('/')
        .expect(200)
        .expect('Hello World!');
    });

    afterEach(async () => {
      if (database?.source.isInitialized)
        await database.source.query(
          `DROP SCHEMA ${database.source.driver.escape(database.schema)} CASCADE`,
        );
      await app?.close();
      if (database?.source.isInitialized) await database.source.destroy();
      process.env = originalEnvironment;
    });
  },
);
