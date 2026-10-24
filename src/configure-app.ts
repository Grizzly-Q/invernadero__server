import { INestApplication, ValidationPipe } from '@nestjs/common';

/**
 * Configura CORS para el proyecto React local y aplica la validación global de entradas.
 * @param app Instancia NestJS que recibe el middleware HTTP y el pipe de validación.
 * @returns Sin contenido; modifica la configuración de la aplicación antes de iniciarla.
 */
export function configureApp(app: INestApplication): void {
  // React usa JWT en Authorization; no necesita cookies ni credenciales de sesión del navegador.
  app.enableCors({
    origin: ['http://localhost:5173'],
    methods: ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Authorization', 'Content-Type'],
    credentials: false,
  });
  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: true,
    }),
  );
}
