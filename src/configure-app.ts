import { ConfigService } from '@nestjs/config';
import type { AuthConfig } from './config/auth.config';
import { INestApplication, ValidationPipe } from '@nestjs/common';

/**
 * Configura CORS para el proyecto React local y aplica la validación global de entradas.
 * @param app Instancia NestJS que recibe el middleware HTTP y el pipe de validación.
 * @returns Sin contenido; modifica la configuración de la aplicación antes de iniciarla.
 */
export function configureApp(app: INestApplication): void {
  // Solo los orígenes explícitos pueden enviar la cookie de renovación desde React.
  app.enableCors({
    origin: app.get(ConfigService).getOrThrow<AuthConfig>('auth').webOrigins,
    methods: ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Authorization', 'Content-Type'],
    credentials: true,
  });
  app.useGlobalPipes(
    new ValidationPipe({
      transform: true,
      whitelist: true,
      forbidNonWhitelisted: true,
    }),
  );
}
