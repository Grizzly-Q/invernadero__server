import {
  Body,
  Controller,
  Get,
  Header,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { DatabaseIdPipe } from '../db/database-id';
import { ControllerPageDto } from '../controllers/dto/controller.dto';
import type { PublicUser } from '../users/user.types';
import {
  CreateGreenhouseDto,
  UpdateGreenhouseDto,
  GreenhouseStatusDto,
} from './greenhouse.dto';
import { GreenhousesService } from './greenhouses.service';

/** Rutas humanas autenticadas; cada consulta comprueba la pertenencia en PostgreSQL. */
@Controller('greenhouses')
export class GreenhousesController {
  constructor(private readonly greenhouses: GreenhousesService) {}

  /** Crea un invernadero y asigna ADMIN al creador; responde 201 y no acepta roles ni propietarios externos. */
  @Post()
  @Header('Cache-Control', 'no-store')
  create(@CurrentUser() user: PublicUser, @Body() dto: CreateGreenhouseDto) {
    return this.greenhouses.create(user.id, dto);
  }

  /** Lista las pertenencias de la cuenta autenticada con cursor opcional; devuelve una página vacía si no tiene ninguna. */
  @Get()
  @Header('Cache-Control', 'no-store')
  list(@CurrentUser() user: PublicUser, @Query() query: ControllerPageDto) {
    return this.greenhouses.list(user.id, query.beforeId);
  }

  /** Edita datos generales como ADMIN; la pertenencia se comprueba dentro de la transacción. */
  @Patch(':id')
  @Header('Cache-Control', 'no-store')
  update(
    @CurrentUser() user: PublicUser,
    @Param('id', DatabaseIdPipe) id: string,
    @Body() dto: UpdateGreenhouseDto,
  ) {
    return this.greenhouses.update(user.id, id, dto);
  }

  /** Desactivar conserva historial y bloquea el equipo; reactivar no lo habilita automáticamente. */
  @Patch(':id/status')
  @Header('Cache-Control', 'no-store')
  setStatus(
    @CurrentUser() user: PublicUser,
    @Param('id', DatabaseIdPipe) id: string,
    @Body() dto: GreenhouseStatusDto,
  ) {
    return this.greenhouses.setStatus(user.id, id, dto.status);
  }

  /** Consulta un invernadero propio; responde 403 si no existe una pertenencia autorizada. */
  @Get(':id')
  @Header('Cache-Control', 'no-store')
  get(
    @CurrentUser() user: PublicUser,
    @Param('id', DatabaseIdPipe) id: string,
  ) {
    return this.greenhouses.get(user.id, id);
  }

  /** Consulta miembros del invernadero como administrador; no crea invitaciones ni modifica roles. */
  @Get(':id/members')
  @Header('Cache-Control', 'no-store')
  members(
    @CurrentUser() user: PublicUser,
    @Param('id', DatabaseIdPipe) id: string,
    @Query() query: ControllerPageDto,
  ) {
    return this.greenhouses.members(user.id, id, query.beforeId);
  }
}
