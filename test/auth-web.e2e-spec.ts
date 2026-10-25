import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { UnauthorizedException, type INestApplication } from '@nestjs/common';
import type { Server } from 'node:http';
import request from 'supertest';
import { AuthController } from '../src/auth/auth.controller';
import { AuthService } from '../src/auth/auth.service';
import { authConfig } from '../src/config/auth.config';
import { configureApp } from '../src/configure-app';

/** Verifica el contrato HTTP y las defensas de cookies sin utilizar una base de datos compartida. */
describe('Autenticación web: cookies y origen', () => {
  let app: INestApplication;
  let server: Server;
  const tokens = {
    accessToken: 'access',
    tokenType: 'Bearer',
    expiresIn: 900,
    user: {
      id: 'user',
      name: 'Ana',
      email: 'ana@example.com',
    },
    refreshToken: 'refresh.jwt.secret',
    refreshExpiresAt: new Date(Date.now() + 604800000),
  };
  const auth = {
    login: jest.fn(),
    register: jest.fn(),
    refresh: jest.fn(),
    logoutWithRefresh: jest.fn(),
    authenticate: jest.fn(),
    logout: jest.fn(),
  };
  beforeAll(async () => {
    const module = await Test.createTestingModule({
      controllers: [AuthController],
      providers: [
        { provide: AuthService, useValue: auth },
        {
          provide: ConfigService,
          useValue: new ConfigService({
            auth: authConfig({
              JWT_SECRET: 'secreto-de-prueba-con-mas-de-32-bytes',
              NODE_ENV: 'production',
            }),
          }),
        },
      ],
    }).compile();
    app = module.createNestApplication();
    configureApp(app);
    await app.init();
    server = app.getHttpServer() as Server;
  });
  beforeEach(() => {
    jest.resetAllMocks();
    auth.login.mockResolvedValue(tokens);
    auth.refresh.mockResolvedValue(tokens);
  });
  afterAll(async () => {
    await app.close();
  });

  it('envía refresh HttpOnly y Secure solo en cookie, sin filtrarlo en JSON', async () => {
    const response = await request(server)
      .post('/auth/login')
      .set('Origin', 'http://localhost:5173')
      .send({ email: 'ana@example.com', password: 'Clave-segura-123' })
      .expect(200);
    const cookie = response.headers['set-cookie'][0];
    expect(cookie).toContain('HttpOnly');
    expect(cookie).toContain('Secure');
    expect(cookie).toContain('SameSite=Lax');
    expect(cookie).toContain('Path=/auth');
    expect(cookie).not.toContain('Domain=');
    expect(response.body).not.toHaveProperty('refreshToken');
    expect(response.body).not.toHaveProperty('refreshExpiresAt');
    expect(response.headers['cache-control']).toBe('no-store');
  });

  it('renueva sin encabezado Bearer y establece la nueva cookie', async () => {
    await request(server)
      .post('/auth/refresh')
      .set('Origin', 'http://localhost:5173')
      .set('Cookie', 'refresh_token=refresh.jwt.secret')
      .expect(200);
    expect(auth.refresh).toHaveBeenCalledWith('refresh.jwt.secret');
  });

  it.each([undefined, 'https://sitio-ajeno.example'])(
    'rechaza renovación sin origen autorizado (%s)',
    async (origin) => {
      const call = request(server)
        .post('/auth/refresh')
        .set('Cookie', 'refresh_token=refresh.jwt.secret');
      if (origin) call.set('Origin', origin);
      await call.expect(403);
      expect(auth.refresh).not.toHaveBeenCalled();
    },
  );

  it('rechaza cookies duplicadas y limpia la cookie ante refresh inválido', async () => {
    await request(server)
      .post('/auth/refresh')
      .set('Origin', 'http://localhost:5173')
      .set('Cookie', 'refresh_token=one; refresh_token=two')
      .expect(401);
    expect(auth.refresh).not.toHaveBeenCalled();
    auth.refresh.mockRejectedValue(new UnauthorizedException());
    const response = await request(server)
      .post('/auth/refresh')
      .set('Origin', 'http://localhost:5173')
      .set('Cookie', 'refresh_token=invalid')
      .expect(401);
    expect(response.headers['set-cookie'][0]).toContain(
      'Expires=Thu, 01 Jan 1970',
    );
  });

  it('cierra sesión con refresh sin exigir acceso vigente y borra la cookie', async () => {
    const response = await request(server)
      .post('/auth/logout')
      .set('Origin', 'http://localhost:5173')
      .set('Cookie', 'refresh_token=refresh.jwt.secret')
      .expect(204);
    expect(auth.logoutWithRefresh).toHaveBeenCalledWith('refresh.jwt.secret');
    expect(response.headers['set-cookie'][0]).toContain(
      'Expires=Thu, 01 Jan 1970',
    );
  });
});
