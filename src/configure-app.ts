import { INestApplication, ValidationPipe } from '@nestjs/common';

/** Aplica la misma validación JSON en el servidor y las pruebas de integración. */
export function configureApp(app: INestApplication): void {
  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: true,
    }),
  );
}
