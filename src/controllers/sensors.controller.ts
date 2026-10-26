import {
  Body,
  Controller,
  Delete,
  Header,
  HttpCode,
  Param,
  Patch,
} from '@nestjs/common';
import { ControllerScope } from '../auth/decorators/controller-scope.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import type { PublicUser } from '../users/user.types';
import { Role } from '../users/role.enum';
import { DatabaseIdPipe } from '../db/database-id';
import { CreateSensorDto } from './dto/controller.dto';
import { SensorsService } from './sensors.service';

/** Administración de sensores reservada al administrador del invernadero propietario. */
@Controller('controllers')
@Roles(Role.ADMIN)
@ControllerScope()
export class SensorsController {
  constructor(private readonly sensors: SensorsService) {}

  /** PATCH: corrige el tipo y su unidad canónica; requiere controlador bloqueado y sensor sin historial. */
  @Patch(':id/sensors/:sensorId')
  @Header('Cache-Control', 'no-store')
  update(
    @CurrentUser() user: PublicUser,
    @Param('id', DatabaseIdPipe) id: string,
    @Param('sensorId', DatabaseIdPipe) sensorId: string,
    @Body() dto: CreateSensorDto,
  ) {
    return this.sensors.change(user.id, id, sensorId, dto);
  }

  /** DELETE: elimina únicamente un registro sin mediciones y devuelve 204; nunca borra el historial. */
  @Delete(':id/sensors/:sensorId')
  @HttpCode(204)
  @Header('Cache-Control', 'no-store')
  async remove(
    @CurrentUser() user: PublicUser,
    @Param('id', DatabaseIdPipe) id: string,
    @Param('sensorId', DatabaseIdPipe) sensorId: string,
  ): Promise<void> {
    await this.sensors.change(user.id, id, sensorId);
  }
}
