import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { JwtService } from '@nestjs/jwt';
import request from 'supertest';
import type { App } from 'supertest/types';
import { AppModule } from '../src/app.module';
import type { AccessClaims, TokenResponse } from '../src/auth/auth.types';
import { configureApp } from '../src/configure-app';
import { Role } from '../src/users/role.enum';

describe('Autenticación JWT y autorización (e2e)', () => {
  let app: INestApplication<App>;
  let originalEnvironment: NodeJS.ProcessEnv;
  const credentials = {
    name: 'Usuario Android',
    email: 'usuario@example.com',
    password: 'Una-clave-segura-123',
  };

  beforeEach(async () => {
    originalEnvironment = { ...process.env };
    process.env.JWT_SECRET = 'secreto-exclusivo-de-pruebas-con-32-bytes';
    process.env.JWT_ISSUER = 'invernadero-api';
    process.env.JWT_AUDIENCE = 'invernadero-android';
    process.env.JWT_ACCESS_TTL_SECONDS = '900';
    process.env.ADMIN_EMAIL = 'admin@example.com';
    process.env.ADMIN_PASSWORD = 'Admin-seguro-123';
    const module = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = module.createNestApplication();
    configureApp(app);
    await app.init();
  });

  afterEach(async () => {
    jest.restoreAllMocks();
    await app?.close();
    process.env = originalEnvironment;
  });

  async function register(): Promise<TokenResponse> {
    const response = await request(app.getHttpServer())
      .post('/auth/register')
      .send(credentials)
      .expect(201);
    return response.body as TokenResponse;
  }

  it('registra OPERATOR, normaliza el correo y permite leer su perfil sin filtrar credenciales', async () => {
    const response = await request(app.getHttpServer())
      .post('/auth/register')
      .send({ ...credentials, email: '  USUARIO@example.com  ' })
      .expect(201)
      .expect('Cache-Control', 'no-store');
    const tokens = response.body as TokenResponse;
    expect(tokens.tokenType).toBe('Bearer');
    expect(tokens.expiresIn).toBe(900);
    expect(Object.keys(tokens).sort()).toEqual([
      'accessToken',
      'expiresIn',
      'tokenType',
      'user',
    ]);
    expect(tokens.user.role).toBe(Role.OPERATOR);
    expect(tokens.user.email).toBe(credentials.email);
    expect(tokens.user).not.toHaveProperty('passwordHash');
    expect(tokens.user).not.toHaveProperty('password');
    const claims = app.get(JwtService).decode<AccessClaims>(tokens.accessToken);
    expect(claims.sub).toBe(tokens.user.id);
    expect(claims).not.toHaveProperty('password');
    await request(app.getHttpServer())
      .get('/auth/me')
      .set('Authorization', `Bearer ${tokens.accessToken}`)
      .expect(200)
      .expect(tokens.user);
  });

  it('permite login y rechaza tanto una contraseña incorrecta como un correo inexistente', async () => {
    await register();
    const response = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: credentials.email, password: credentials.password })
      .expect(200);
    expect((response.body as TokenResponse).accessToken).toBeDefined();
    const wrongPassword = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: credentials.email, password: 'incorrecta-123' })
      .expect(401);
    const unknownUser = await request(app.getHttpServer())
      .post('/auth/login')
      .send({
        email: 'desconocido@example.com',
        password: credentials.password,
      })
      .expect(401);
    expect(unknownUser.body).toEqual(wrongPassword.body);
  });

  it('rechaza correos duplicados, incluso con registros concurrentes', async () => {
    const responses = await Promise.all([
      request(app.getHttpServer()).post('/auth/register').send(credentials),
      request(app.getHttpServer()).post('/auth/register').send(credentials),
    ]);
    expect(responses.map((response) => response.status).sort()).toEqual([
      201, 409,
    ]);
  });

  it.each([
    { ...credentials, role: 'ADMIN' },
    { ...credentials, role: 'CONTROLLER' },
    { ...credentials, password: 'corta' },
    { ...credentials, email: 'incorrecto' },
    { ...credentials, name: '  ' },
    { ...credentials, password: 12345678 },
  ])('rechaza un registro inválido o campos adicionales (%j)', async (body) => {
    await request(app.getHttpServer())
      .post('/auth/register')
      .send(body)
      .expect(400);
  });

  it('rechaza peticiones sin token, con esquema incorrecto o JWT manipulado', async () => {
    await request(app.getHttpServer()).get('/auth/me').expect(401);
    await request(app.getHttpServer())
      .get('/auth/me')
      .set('Authorization', 'Basic credenciales')
      .expect(401);
    await request(app.getHttpServer())
      .get('/auth/me')
      .set('Authorization', 'Bearer token-invalido')
      .expect(401);
    const tokens = await register();
    const [header, payload, signature] = tokens.accessToken.split('.');
    const changedSignature =
      (signature[0] === 'a' ? 'b' : 'a') + signature.slice(1);
    await request(app.getHttpServer())
      .get('/auth/me')
      .set('Authorization', `Bearer ${header}.${payload}.${changedSignature}`)
      .expect(401);
    await request(app.getHttpServer())
      .get(`/auth/me?token=${tokens.accessToken}`)
      .expect(401);
  });

  it('rechaza JWT vencidos, con firma o claims incorrectos', async () => {
    const tokens = await register();
    const jwt = app.get(JwtService);
    const { sub, sid, type } = jwt.decode<AccessClaims>(tokens.accessToken);
    const invalidTokens = [
      jwt.sign({ sub, sid, type }, { expiresIn: -1 }),
      jwt.sign({ sub, sid, type }, { secret: 'otra-clave', expiresIn: 900 }),
      jwt.sign(
        { sub, sid, type },
        { audience: 'otro-cliente', expiresIn: 900 },
      ),
      jwt.sign({ sub, sid, type }, { issuer: 'otro-emisor', expiresIn: 900 }),
      jwt.sign({ sub, sid, type: 'incorrecto' }, { expiresIn: 900 }),
    ];
    for (const token of invalidTokens) {
      await request(app.getHttpServer())
        .get('/auth/me')
        .set('Authorization', `Bearer ${token}`)
        .expect(401);
    }
  });

  it('autoriza ADMIN y devuelve 403 para OPERATOR en el recurso protegido por roles', async () => {
    const user = await register();
    await request(app.getHttpServer()).get('/users').expect(401);
    await request(app.getHttpServer())
      .get('/users')
      .set('Authorization', `Bearer ${user.accessToken}`)
      .expect(403);
    const response = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: 'admin@example.com', password: 'Admin-seguro-123' })
      .expect(200);
    const admin = response.body as TokenResponse;
    const users = await request(app.getHttpServer())
      .get('/users')
      .set('Authorization', `Bearer ${admin.accessToken}`)
      .expect(200);
    expect(users.body).toHaveLength(2);
    expect(JSON.stringify(users.body)).not.toContain('password');
  });

  it('revoca el JWT de la sesión actual y conserva otra sesión del mismo usuario', async () => {
    const first = await register();
    const response = await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: credentials.email, password: credentials.password })
      .expect(200);
    const second = response.body as TokenResponse;
    await request(app.getHttpServer())
      .post('/auth/logout')
      .set('Authorization', `Bearer ${first.accessToken}`)
      .expect(204);
    await request(app.getHttpServer())
      .get('/auth/me')
      .set('Authorization', `Bearer ${first.accessToken}`)
      .expect(401);
    await request(app.getHttpServer())
      .get('/auth/me')
      .set('Authorization', `Bearer ${second.accessToken}`)
      .expect(200);
  });

  it('limita los intentos de login por IP', async () => {
    for (let attempt = 0; attempt < 5; attempt++) {
      await request(app.getHttpServer())
        .post('/auth/login')
        .send({ email: credentials.email, password: credentials.password })
        .expect(401);
    }
    await request(app.getHttpServer())
      .post('/auth/login')
      .send({ email: credentials.email, password: credentials.password })
      .expect(429);
  });
});
