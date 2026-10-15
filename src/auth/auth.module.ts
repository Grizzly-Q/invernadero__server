import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { UsersController } from '../users/users.controller';
import { UsersService } from '../users/users.service';
import type { AuthConfig } from './auth.config';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { RolesGuard } from './guards/roles.guard';
import { PasswordService } from './password.service';

/** Registra autenticación global, autorización por roles y límites por IP. */
@Module({
  imports: [
    ThrottlerModule.forRoot([{ ttl: 60000, limit: 60 }]),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => {
        const options = config.getOrThrow<AuthConfig>('auth');
        return {
          secret: options.secret,
          signOptions: {
            algorithm: 'HS256',
            issuer: options.issuer,
            audience: options.audience,
          },
        };
      },
    }),
  ],
  controllers: [AuthController, UsersController],
  providers: [
    PasswordService,
    UsersService,
    AuthService,
    // El orden garantiza que ningún guard de roles use una identidad sin verificar.
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
  exports: [AuthService, UsersService],
})
export class AuthModule {}
