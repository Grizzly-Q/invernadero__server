import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ControllerEntity } from './entities/controller.entity';
import { ControllerCredentialEntity } from './entities/controller-credential.entity';
import {
  ControllersController,
  ControllerIdentityController,
} from './controllers.controller';
import { ControllersService } from './controllers.service';
import { ControllerCredentialsService } from './controller-credentials.service';

/** Administra controladores ESP32, sensores y credenciales, separados de las cuentas de usuarios humanos. */
@Module({
  imports: [
    TypeOrmModule.forFeature([ControllerEntity, ControllerCredentialEntity]),
  ],
  controllers: [ControllerIdentityController, ControllersController],
  providers: [ControllersService, ControllerCredentialsService],
  exports: [ControllerCredentialsService],
})
export class ControllersModule {}
