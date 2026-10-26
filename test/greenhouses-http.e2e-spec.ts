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
import { GreenhouseEntity } from '../src/db/entities/greenhouse.entity';
import { SensorEntity } from '../src/telemetry/entities/sensor.entity';
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
    height: string | null;
    description: string | null;
    status: 'Activo' | 'EnMantenimiento' | 'Desactivado';
    operationMode: 'Manual' | 'Automatico';
  };
  let houses = new Map<string, House>();
  let memberships = new Map<string, Role>();
  let equipment: {
    id: string;
    greenhouseId: string;
    active: boolean;
    connectionStatus: string;
  } | null = null;
  const updates = jest.fn();
  let inventory: Array<{
    id: string;
    controllerId: string;
    type: 'NivelAgua';
    unit: string;
    connectionStatus: 'Desconectado';
    credential?: string;
  }> = [];
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
      findOneBy: ({
        id,
        greenhouseId,
      }: {
        id?: string;
        greenhouseId?: string;
      }) =>
        Promise.resolve(
          entity === ControllerEntity
            ? greenhouseId
              ? equipment?.greenhouseId === greenhouseId
                ? { ...equipment }
                : null
              : { id, greenhouseId: '1' }
            : id
              ? (houses.get(id) ?? null)
              : null,
        ),
      find: ({ where }: { where: { controllerId: string } }) =>
        Promise.resolve(
          entity === SensorEntity
            ? inventory.filter(
                (sensor) => sensor.controllerId === where.controllerId,
              )
            : [],
        ),
    }),
    transaction: async (work: (manager: unknown) => Promise<unknown>) => {
      const pendingHouses = new Map(houses);
      const pendingMemberships = new Map(memberships);
      let pendingEquipment = equipment ? { ...equipment } : null;
      const result = await work({
        findOne: (
          entity: unknown,
          { where }: { where: { id?: string; greenhouseId?: string } },
        ) =>
          Promise.resolve(
            entity === GreenhouseEntity
              ? where.id && pendingHouses.has(where.id)
                ? { ...pendingHouses.get(where.id)! }
                : null
              : pendingEquipment &&
                  pendingEquipment.greenhouseId === where.greenhouseId
                ? { ...pendingEquipment }
                : null,
          ),
        findOneBy: (_entity: unknown, { id }: { id: string }) =>
          Promise.resolve({ id, databaseId: id }),
        create: (_entity: unknown, row: unknown) => row,
        save: (_entity: unknown, row: Partial<House>) => {
          const house = {
            height: null,
            description: null,
            status: 'Activo',
            operationMode: 'Manual',
            ...row,
            id: row.id ?? String(++sequence),
          } as House;
          pendingHouses.set(house.id, house);
          return Promise.resolve(house);
        },
        query: (sql: string, params: string[]) => {
          if (sql.includes('SELECT m.')) {
            const role = pendingMemberships.get(`${params[0]}:${params[1]}`);
            return Promise.resolve(role ? [{ role }] : []);
          }
          if (failMembership)
            return Promise.reject(new Error('Fallo simulado de pertenencia'));
          pendingMemberships.set(`${params[0]}:${params[1]}`, Role.ADMIN);
          return Promise.resolve([]);
        },
        update: (
          entity: unknown,
          criteria: unknown,
          values: Record<string, unknown>,
        ) => {
          updates(entity, criteria, values);
          if (entity === ControllerEntity && pendingEquipment?.id === criteria)
            pendingEquipment = { ...pendingEquipment, ...values };
          return Promise.resolve({ affected: 1 });
        },
      });
      houses = pendingHouses;
      memberships = pendingMemberships;
      equipment = pendingEquipment;
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
    equipment = null;
    inventory = [];
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

  it('edita el mismo registro por HTTP y permite borrar opcionales sin cambiar estado', async () => {
    await create('ana').expect(201);
    const response = await request(server)
      .patch('/greenhouses/1')
      .set('Authorization', 'Bearer ana')
      .send({
        name: ' Norte ',
        location: ' Sector A ',
        length: 12.25,
        height: null,
        description: null,
      })
      .expect(200);
    expect(response.body as unknown).toMatchObject({
      id: '1',
      name: 'Norte',
      location: 'Sector A',
      length: '12.25',
      width: '5',
      height: null,
      description: null,
      status: 'Activo',
      role: 'ADMIN',
    });
    expect(response.headers['cache-control']).toBe('no-store');
    expect(houses.size).toBe(1);
  });

  it('deniega edición y desactivación a no miembros y operadores, incluso después de revocar un permiso', async () => {
    await create('ana').expect(201);
    memberships.set('operador:1', Role.OPERATOR);
    for (const user of ['ajeno', 'operador']) {
      await request(server)
        .patch('/greenhouses/1')
        .set('Authorization', `Bearer ${user}`)
        .send({ name: 'Ajeno' })
        .expect(403);
      await request(server)
        .patch('/greenhouses/1/status')
        .set('Authorization', `Bearer ${user}`)
        .send({ status: 'Desactivado' })
        .expect(403);
    }
    memberships.set('ana:1', Role.OPERATOR);
    await request(server)
      .patch('/greenhouses/1')
      .set('Authorization', 'Bearer ana')
      .send({ name: 'Sin permiso vigente' })
      .expect(403);
    expect(houses.get('1')?.name).toBe('Cultivo');
    expect(updates).not.toHaveBeenCalled();
  });

  it('desactiva y reactiva sin borrar registros ni habilitar automáticamente el equipo', async () => {
    await create('ana').expect(201);
    equipment = {
      id: '7',
      greenhouseId: '1',
      active: true,
      connectionStatus: 'Conectado',
    };
    await request(server)
      .patch('/greenhouses/1/status')
      .set('Authorization', 'Bearer ana')
      .send({ status: 'Desactivado' })
      .expect(200);
    expect(equipment).toMatchObject({
      active: false,
      connectionStatus: 'Desconectado',
    });
    expect(updates).toHaveBeenCalledWith(
      SensorEntity,
      { controllerId: '7' },
      { connectionStatus: 'Desconectado' },
    );
    const inactiveEdit = await request(server)
      .patch('/greenhouses/1')
      .set('Authorization', 'Bearer ana')
      .send({ description: 'Sigue desactivado' })
      .expect(200);
    expect((inactiveEdit.body as House).status).toBe('Desactivado');
    const list = await request(server)
      .get('/greenhouses')
      .set('Authorization', 'Bearer ana')
      .expect(200);
    expect((list.body as { items: House[] }).items).toHaveLength(1);
    expect((list.body as { items: House[] }).items[0].status).toBe(
      'Desactivado',
    );
    await request(server)
      .patch('/greenhouses/1/status')
      .set('Authorization', 'Bearer ana')
      .send({ status: 'Activo' })
      .expect(200);
    expect(equipment).toMatchObject({ active: false });
    expect(houses.size).toBe(1);
  });

  it('rechaza campos protegidos y datos inválidos con los pipes reales', async () => {
    await create('ana').expect(201);
    for (const body of [
      { status: 'Desactivado' },
      { role: 'ADMIN' },
      { ownerId: 'otro' },
      { name: null },
      { length: 0 },
      { width: 1.234 },
    ]) {
      await request(server)
        .patch('/greenhouses/1')
        .set('Authorization', 'Bearer ana')
        .send(body)
        .expect(400);
    }
    for (const body of [
      {},
      { status: 'Eliminado' },
      { status: 'Desactivado', active: true },
    ]) {
      await request(server)
        .patch('/greenhouses/1/status')
        .set('Authorization', 'Bearer ana')
        .send(body)
        .expect(400);
    }
    await request(server)
      .patch('/greenhouses/0')
      .set('Authorization', 'Bearer ana')
      .send({ name: 'No válido' })
      .expect(400);
    expect(houses.get('1')?.status).toBe('Activo');
  });

  it('exige sesión en las dos rutas de escritura', async () => {
    await request(server)
      .patch('/greenhouses/1')
      .send({ name: 'Sin sesión' })
      .expect(401);
    await request(server)
      .patch('/greenhouses/1/status')
      .send({ status: 'Desactivado' })
      .expect(401);
  });

  it('ofrece inventario de solo lectura a ADMIN y OPERATOR sin exponer secretos ni requerir equipo activo', async () => {
    await create('ana').expect(201);
    memberships.set('operador:1', Role.OPERATOR);
    houses.get('1')!.status = 'Desactivado';
    equipment = {
      id: '7',
      greenhouseId: '1',
      active: false,
      connectionStatus: 'Desconectado',
    };
    inventory = [
      {
        id: '9007199254740993',
        controllerId: '7',
        type: 'NivelAgua',
        unit: 'cm',
        connectionStatus: 'Desconectado',
        credential: 'no-exponer',
      },
    ];
    for (const token of ['ana', 'operador']) {
      const response = await request(server)
        .get('/greenhouses/1/sensors')
        .set('Authorization', `Bearer ${token}`)
        .expect(200);
      expect(response.headers['cache-control']).toBe('no-store');
      expect(response.body as unknown).toEqual({
        greenhouseId: '1',
        controllerId: '7',
        items: [
          {
            id: '9007199254740993',
            controllerId: '7',
            type: 'NivelAgua',
            unit: 'cm',
            connectionStatus: 'Desconectado',
          },
        ],
      });
    }
    await request(server)
      .get('/greenhouses/1/sensors')
      .set('Authorization', 'Bearer ajeno')
      .expect(403);
    await request(server).get('/greenhouses/1/sensors').expect(401);
    await request(server)
      .get('/greenhouses/0/sensors')
      .set('Authorization', 'Bearer ana')
      .expect(400);
    memberships.delete('operador:1');
    await request(server)
      .get('/greenhouses/1/sensors')
      .set('Authorization', 'Bearer operador')
      .expect(403);
  });

  it('distingue por HTTP ausencia de controlador y ausencia de sensores', async () => {
    await create('ana').expect(201);
    const empty = await request(server)
      .get('/greenhouses/1/sensors')
      .set('Authorization', 'Bearer ana')
      .expect(200);
    expect(empty.body as unknown).toEqual({
      greenhouseId: '1',
      controllerId: null,
      items: [],
    });
    equipment = {
      id: '7',
      greenhouseId: '1',
      active: false,
      connectionStatus: 'Desconectado',
    };
    const withoutSensors = await request(server)
      .get('/greenhouses/1/sensors')
      .set('Authorization', 'Bearer ana')
      .expect(200);
    expect(withoutSensors.body as unknown).toEqual({
      greenhouseId: '1',
      controllerId: '7',
      items: [],
    });
  });
});
