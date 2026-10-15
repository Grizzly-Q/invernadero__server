import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { ConfigModule } from '@nestjs/config';
import { AuthModule } from './auth/auth.module';
import { authConfig } from './auth/auth.config';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [() => ({ auth: authConfig() })],
    }),
    AuthModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
/** Módulo raíz con configuración de entorno y seguridad global. */
export class AppModule {}
