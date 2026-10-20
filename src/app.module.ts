import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from './auth/auth.module';
import { authConfig } from './config/auth.config';
import { dbConfig } from './config/db.config';
import { DbModule } from './db/db.module';
import { validateEnvironment } from './config/environment.validation';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validate: validateEnvironment,
      load: [() => ({ auth: authConfig() })],
    }),
    // Configura la conexión PostgreSQL con las variables ya validadas.
    TypeOrmModule.forRootAsync({
      inject: [ConfigService],
      useFactory: dbConfig,
    }),
    AuthModule,
    DbModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
/** Módulo raíz con configuración de entorno, seguridad y base de datos. */
export class AppModule {}
