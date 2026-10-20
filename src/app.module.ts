import { Module } from '@nestjs/common';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { AuthModule } from './auth/auth.module';
import { authConfig } from './auth/auth.config';
import { DbModule } from './db/db.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      load: [() => ({ auth: authConfig() })],
    }),
    // configuracion base TypeORM
    TypeOrmModule.forRootAsync({
      //entrega el servicio de configuracion
      inject: [ConfigService],
      //opciones de conexion de nest
      useFactory: (config: ConfigService) => ({
        type: 'postgres',
        url: config.getOrThrow<string>('DATABASE_URL'),
        //carga las entidades automaticamente
        autoLoadEntities: true,
        //Evita que TypeOrm no modifica las tablas existentes
        synchronize: false,
        poolSize: 3,
        ssl: { rejectUnauthorized: false },
      }),
    }),
    AuthModule,
    DbModule,
  ],
  controllers: [AppController],
  providers: [AppService],
})
/** Módulo raíz con configuración de entorno, seguridad y base de datos. */
export class AppModule {}
