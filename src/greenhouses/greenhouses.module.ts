import { Module } from '@nestjs/common';
import { GreenhouseAccessService } from './greenhouse-access.service';
import { GreenhousesController } from './greenhouses.controller';
import { GreenhousesService } from './greenhouses.service';

/** Comparte la autorización por pertenencia sin depender del módulo de autenticación. */
@Module({
  controllers: [GreenhousesController],
  providers: [GreenhouseAccessService, GreenhousesService],
  exports: [GreenhouseAccessService],
})
export class GreenhousesModule {}
