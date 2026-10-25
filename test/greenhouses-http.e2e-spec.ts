import { Global, Module } from '@nestjs/common';
import type { INestApplication } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { Test } from '@nestjs/testing';
import { DataSource } from 'typeorm';
import type { Server } from 'node:http';
import request from 'supertest';
import { AuthService } from '../src/auth/auth.service';
import { AuthenticationGuard } from '../src/auth/guards/authentication.guard';
import { RolesGuard } from '../src/auth/guards/roles.guard';
import { authConfig } from '../src/config/auth.config';
import { configureApp } from '../src/configure-app';
import { ControllersController } from '../src/controllers/controllers.controller';
import { ControllersService } from '../src/controllers/controllers.service';
import { ControllerCredentialsService } from '../src/controllers/controller-credentials.service';
import { ControllerEntity } from '../src/controllers/entities/controller.entity';
import { GreenhousesModule } from '../src/greenhouses/greenhouses.module';
import { Role } from '../src/users/role.enum';

/** Recorre rutas, guards y validación reales; simula PostgreSQL sin comprobar el motor SQL. */
describe('Invernaderos HTTP y aislamiento', () => {
  let app: INestApplication;
  let server: Server;
  let sequence = 0;
  let failMembership = false;
  type House = {
    id: string;
    name: string;
    location: string;
    length: string;
    width: string;
  };
  let houses = new Map<string, House>();
  let memberships = new Map<string, Role>();
  const controllers = { create: jest.fn(), list: jest.fn() };
  const credentials = { issue: jest.fn() };
  const source = {
    options: { type: 'postgres', schema: 'prueba' },
    driver: { escape: (value: string) => `"${value}"` },
    query: jest.fn((sql: string, params: string[]) => {
      if (sql.includes('SELECT m.')) {
        const role = memberships.get(`${params[0]}:${params[1]}`);
        return Promise.resolve(role ? [{ role }] : []);
      }
      if (sql.includes('SELECT u.')) return Promise.resolve([]);
      return Promise.resolve(
        [...houses.values()]
          .filter((house) => memberships.has(`${params[0]}:${house.id}`))
          .map((house) => ({
            ...house,
            role: memberships.get(`${params[0]}:${house.id}`),
          })),
      );
    }),
    getRepository: (entity: unknown) => ({
      findOneBy: ({ id }: { id: string }) =>
        Promise.resolve(
          entity === ControllerEntity
            ? { id, greenhouseId: '1' }
            : (houses.get(id) ?? null),
        ),
    }),
    transaction: async (work: (manager: unknown) => Promise<unknown>) => {
      const pendingHouses = new Map(houses);
      const pendingMemberships = new Map(memberships);
      const result = await work({
        findOneBy: (_entity: unknown, { id }: { id: string }) =>
          Promise.resolve({ id, databaseId: id }),
        create: (_entity: unknown, row: unknown) => row,
        save: (_entity: unknown, row: Omit<House, 'id'>) => {
          const house = { ...row, id: String(++sequence) };
          pendingHouses.set(house.id, house);
          return Promise.resolve(house);
        },
        query: (_sql: string, params: string[]) => {
          if (failMembership)
            return Promise.reject(new Error('Fallo simulado de pertenencia'));
          pendingMemberships.set(`${params[0]}:${params[1]}`, Role.ADMIN);
          return Promise.resolve([]);
        },
      });
      houses = pendingHouses;
      memberships = pendingMemberships;
      return result;
    },
  };
  @Global()
  @Module({
    providers: [{ provide: DataSource, useValue: source }],
    exports: [DataSource],
  })
  class TestDatabaseModule {}

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      imports: [TestDatabaseModule, GreenhousesModule],
      controllers: [ControllersController],
      providers: [
        { provide: DataSource, useValue: source },
        {
          provide: ConfigService,
          useValue: new ConfigService({
            auth: authConfig({
              JWT_SECRET: 'secreto-de-prueba-con-mas-de-32-bytes',
            }),
          }),
        },
        {
          provide: AuthService,
          useValue: {
            authenticate: (token: string) =>
              Promise.resolve({
                user: { id: token, name: token, email: `${token}@example.com` },
                sessionId: token,
              }),
          },
        },
        { provide: ControllersService, useValue: controllers },
        { provide: ControllerCredentialsService, useValue: credentials },
        { provide: APP_GUARD, useClass: AuthenticationGuard },
        { provide: APP_GUARD, useClass: RolesGuard },
      ],
    })
      .overrideProvider(DataSource)
      .useValue(source)
      .compile();
    app = module.createNestApplication({ logger: false });
    configureApp(app);
    await app.init();
    server = app.getHttpServer() as Server;
  });
  beforeEach(() => {
    sequence = 0;
    houses.clear();
    memberships.clear();
    failMembership = false;
    jest.clearAllMocks();
  });
  afterAll(async () => {
    await app?.close();
  });
  const dto = { name: 'Cultivo', location: 'Lima', length: 10, width: 5 };
  const create = (token: string) =>
    request(server)
      .post('/greenhouses')
      .set('Authorization', `Bearer ${token}`)
      .send(dto);

  it('crea como ADMIN sin cambiar la identidad global y permite roles distintos en otro invernadero', async () => {
    const first = await create('ana').expect(201);
    const second = await create('luis').expect(201);
    const anaHouse = first.body as { id: string; role: Role };
    const luisHouse = second.body as { id: string; role: Role };
    expect(anaHouse.role).toBe(Role.ADMIN);
    expect(luisHouse.role).toBe(Role.ADMIN);
    memberships.set(`luis:${anaHouse.id}`, Role.OPERATOR);
    const response = await request(server)
      .get('/greenhouses')
      .set('Authorization', 'Bearer luis')
      .expect(200);
    expect(
      (response.body as { items: Array<{ role: Role }> }).items
        .map((house) => house.role)
        .sort(),
    ).toEqual([Role.ADMIN, Role.OPERATOR]);
    await request(server)
      .get(`/greenhouses/${luisHouse.id}`)
      .set('Authorization', 'Bearer ana')
      .expect(403);
  });
  it('deniega acceso a equipos y credenciales de otro invernadero incluso siendo administrador de uno propio', async () => {
    await create('ana').expect(201);
    await create('luis').expect(201);
    await request(server)
      .post('/controllers/7/credentials')
      .set('Authorization', 'Bearer luis')
      .send({})
      .expect(403);
    expect(credentials.issue).not.toHaveBeenCalled();
    await request(server)
      .post('/controllers')
      .set('Authorization', 'Bearer luis')
      .send({ greenhouseId: '1', name: 'Ajeno' })
      .expect(403);
    expect(controllers.create).not.toHaveBeenCalled();
  });
  it('permite consulta al operador pero no administración de miembros ni equipos', async () => {
    await create('ana').expect(201);
    memberships.set('luis:1', Role.OPERATOR);
    await request(server)
      .get('/greenhouses/1')
      .set('Authorization', 'Bearer luis')
      .expect(200);
    await request(server)
      .get('/greenhouses/1/members')
      .set('Authorization', 'Bearer luis')
      .expect(403);
    await request(server)
      .post('/controllers')
      .set('Authorization', 'Bearer luis')
      .send({ greenhouseId: '1', name: 'Ajeno' })
      .expect(403);
  });
  it('rechaza propietarios y roles enviados por el cliente y exige autenticación', async () => {
    await request(server).post('/greenhouses').send(dto).expect(401);
    await request(server)
      .post('/greenhouses')
      .set('Authorization', 'Bearer ana')
      .send({ ...dto, ownerId: 'otro', role: 'ADMIN' })
      .expect(400);
    expect(houses.size).toBe(0);
  });
  it('no conserva un invernadero si falla su pertenencia administrativa', async () => {
    const log = jest
      .spyOn(console, 'error')
      .mockImplementation(() => undefined);
    try {
      failMembership = true;
      await create('ana').expect(500);
      expect(houses.size).toBe(0);
      expect(memberships.size).toBe(0);
    } finally {
      log.mockRestore();
    }
  });
});
