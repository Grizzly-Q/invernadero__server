import { Body, Controller, INestApplication, Post } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import type { App } from 'supertest/types';
import { LoginDto } from './auth/dto/login.dto';
import { configureApp } from './configure-app';

@Controller('validacion')
class ValidationTestController {
  @Post()
  validate(@Body() dto: LoginDto) {
    return dto;
  }
}

describe('Mensajes de validación en español', () => {
  let app: INestApplication<App>;

  beforeEach(async () => {
    const module = await Test.createTestingModule({
      controllers: [ValidationTestController],
    }).compile();
    app = module.createNestApplication();
    configureApp(app);
    await app.init();
  });

  afterEach(async () => {
    await app.close();
  });

  it('traduce correo, contraseña y campos no permitidos', async () => {
    const response = await request(app.getHttpServer())
      .post('/validacion')
      .send({ email: 'correo-invalido', password: 'corta', role: 'ADMIN' })
      .expect(400);

    expect(response.body.message).toEqual(
      expect.arrayContaining([
        'El correo debe tener un formato de correo válido.',
        'La contraseña debe tener al menos 8 caracteres.',
        'La propiedad "role" no está permitida.',
      ]),
    );
  });
});
