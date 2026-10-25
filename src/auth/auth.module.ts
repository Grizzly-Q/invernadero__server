import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { JwtModule } from '@nestjs/jwt';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { TypeOrmModule } from '@nestjs/typeorm';
import { UsersController } from '../users/users.controller';
import { UsersService } from '../users/users.service';
import type { AuthConfig } from '../config/auth.config';
import { AuthController } from './auth.controller';
import { AuthService } from './auth.service';
import { AuthenticationGuard } from './guards/authentication.guard';
import { ControllersModule } from '../controllers/controllers.module';
import { ControllerThrottlerGuard } from './guards/controller-throttler.guard';
import { RolesGuard } from './guards/roles.guard';
import { PasswordService } from './password.service';
import { UserSessionEntity } from './entities/user-session.entity';
import { UserAccountEntity } from '../users/entities/user-account.entity';

/** Registra identidades de usuarios y equipos, roles y límites por IP y controlador. */
@Module({
  imports: [
    ControllersModule,
    TypeOrmModule.forFeature([UserSessionEntity, UserAccountEntity]),
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
    { provide: APP_GUARD, useClass: AuthenticationGuard },
    { provide: APP_GUARD, useClass: ControllerThrottlerGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
  ],
  exports: [AuthService, UsersService],
})
export class AuthModule {}
