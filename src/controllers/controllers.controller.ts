import { ControllerScope } from '../auth/decorators/controller-scope.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import type { PublicUser } from '../users/user.types';
import {
  Body,
  Controller,
  Delete,
  Get,
  Header,
  HttpCode,
  Param,
  Patch,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import { DeviceOnly } from '../auth/decorators/device-only.decorator';
import { Roles } from '../auth/decorators/roles.decorator';
import { DatabaseIdPipe } from '../db/database-id';
import { Role } from '../users/role.enum';
import { ControllerCredentialsService } from './controller-credentials.service';
import { ControllersService } from './controllers.service';
import { publicController } from './controller.types';
import type { ControllerRequest } from './controller.types';
import {
  ControllerPageDto,
  ControllerStatusDto,
  CreateControllerDto,
  CreateSensorDto,
  IssueControllerCredentialDto,
} from './dto/controller.dto';

/** Comprueba la identidad del ESP32 y registra su última comunicación sin aceptar JWT humanos. */
@Controller('controllers')
@DeviceOnly()
export class ControllerIdentityController {
  constructor(private readonly credentials: ControllerCredentialsService) {}

  /**
   * GET /controllers/me: consulta la identidad del controlador ESP32 autenticado.
   * Requiere su credencial Bearer; no acepta JWT de usuarios humanos.
   * Actualiza lastSeenAt y connectionStatus a Conectado en la misma transacción.
   * @param request Petición cuyo controller fue establecido por el guard de autenticación.
   * @returns HTTP 200 con id, greenhouseId, name, active, connectionStatus, createdAt y lastSeenAt.
   * No devuelve secretos ni hashes. Conectado registra una comunicación válida, no presencia continua.
   * @throws UnauthorizedException (401) si el controlador está desactivado o la credencial no es válida, venció o fue revocada.
   */
  @Get('me')
  @Header('Cache-Control', 'no-store')
  me(@Req() request: ControllerRequest) {
    return this.credentials.withController(request.controller, (controller) =>
      publicController(controller),
    );
  }
}

/**
 * Administra el registro de controladores ESP32, sus sensores y sus credenciales.
 * Sus rutas administrativas requieren JWT y pertenencia ADMIN en el invernadero del equipo.
 * Los guards responden 401 sin autenticación válida y 403 sin pertenencia autorizada.
 * Los identificadores de ruta son cadenas bigint positivas; un formato inválido produce 400.
 * La validación rechaza propiedades adicionales y cuerpos o consultas inválidos con 400.
 * Las respuestas incluyen Cache-Control: no-store para impedir su almacenamiento en caché.
 */
@Controller('controllers')
@Roles(Role.ADMIN)
@ControllerScope()
export class ControllersController {
  constructor(
    private readonly controllers: ControllersService,
    private readonly credentials: ControllerCredentialsService,
  ) {}

  /**
   * POST /controllers: registra un controlador ESP32 desactivado en un invernadero existente.
   * No crea sensores ni credenciales, ni establece una conexión con la placa física.
   * @param dto Cuerpo con greenhouseId (bigint como cadena) y name (de 1 a 100 caracteres tras recortar espacios).
   * @returns HTTP 201 con id, greenhouseId, name, active=false, connectionStatus=Desconectado,
   * createdAt y lastSeenAt=null; el identificador lo genera PostgreSQL.
   * @throws NotFoundException (404) si el invernadero no existe.
   * @throws ConflictException (409) si el invernadero está desactivado o ya tiene un controlador ESP32.
   */
  @Post()
  @Header('Cache-Control', 'no-store')
  create(@Body() dto: CreateControllerDto) {
    return this.controllers.create(dto);
  }

  /**
   * GET /controllers: lista hasta 50 equipos de invernaderos administrados por la cuenta.
   * @param query Consulta opcional beforeId: incluye solamente identificadores menores que ese cursor.
   * @returns HTTP 200 con { items, nextBeforeId }. Cada item es el perfil público del controlador,
   * sin credenciales. Si se obtienen 50 registros, nextBeforeId permite pedir la página siguiente;
   * esa página puede estar vacía. En caso contrario devuelve null.
   */
  @Get()
  @Header('Cache-Control', 'no-store')
  @Roles()
  list(@CurrentUser() user: PublicUser, @Query() query: ControllerPageDto) {
    return this.controllers.list(user.id, query.beforeId);
  }

  /**
   * PATCH /controllers/:id: autoriza o bloquea las comunicaciones de un controlador ESP32.
   * Desactivar establece connectionStatus=Desconectado; no elimina sensores, historial ni credenciales.
   * Reactivar permite usar nuevamente las credenciales que sigan vigentes; no conecta físicamente la placa.
   * @param id Identificador del controlador ESP32 en la ruta.
   * @param dto Cuerpo { active: boolean }; no permite cambiar el nombre o el invernadero.
   * @returns HTTP 200 con el perfil público actualizado del controlador ESP32.
   * @throws NotFoundException (404) si el controlador no existe.
   * @throws BadRequestException (400) si se intenta activar sin credencial vigente o con el invernadero desactivado.
   */
  @Patch(':id')
  @Header('Cache-Control', 'no-store')
  setActive(
    @Param('id', DatabaseIdPipe) id: string,
    @Body() dto: ControllerStatusDto,
  ) {
    return this.controllers.setActive(id, dto.active);
  }

  /**
   * POST /controllers/:id/credentials: genera una credencial adicional para el controlador ESP32.
   * Almacena solamente su hash SHA-256. No revoca las anteriores ni activa el controlador.
   * @param id Identificador del controlador ESP32 en la ruta.
   * @param dto Cuerpo {} o { expiresAt }: fecha futura ISO 8601 con zona; omitirla o null significa sin vencimiento.
   * @returns HTTP 201 con id, controllerId, credential, tokenType=Bearer, createdAt y expiresAt.
   * credential contiene el secreto esp32_ que debe configurarse en la placa; solo se entrega en esta respuesta.
   * @throws NotFoundException (404) si el controlador no existe.
   * @throws BadRequestException (400) si el vencimiento no tiene formato válido o no es futuro.
   */
  @Post(':id/credentials')
  @Header('Cache-Control', 'no-store')
  issue(
    @Param('id', DatabaseIdPipe) id: string,
    @Body() dto: IssueControllerCredentialDto,
  ) {
    return this.credentials.issue(id, dto.expiresAt);
  }

  /**
   * POST /controllers/:id/credentials/rotate: reemplaza las credenciales del controlador ESP32.
   * Revoca todas las anteriores aún no revocadas y genera una nueva en una única transacción.
   * Es necesario actualizar la configuración de la placa: las credenciales anteriores dejan de autorizarla.
   * @param id Identificador del controlador ESP32 en la ruta.
   * @param dto Cuerpo {} o { expiresAt }: fecha futura con zona; omitirla o null significa sin vencimiento.
   * @returns HTTP 201 con id, controllerId, credential, tokenType=Bearer, createdAt y expiresAt.
   * El nuevo secreto original se entrega una sola vez; no cambia el estado active del controlador.
   * @throws NotFoundException (404) si el controlador no existe.
   * @throws BadRequestException (400) si el vencimiento es inválido; la transacción no reemplaza credenciales.
   */
  @Post(':id/credentials/rotate')
  @Header('Cache-Control', 'no-store')
  rotate(
    @Param('id', DatabaseIdPipe) id: string,
    @Body() dto: IssueControllerCredentialDto,
  ) {
    return this.credentials.issue(id, dto.expiresAt, true);
  }

  /**
   * GET /controllers/:id/credentials: consulta credenciales vigentes, vencidas y revocadas.
   * @param id Identificador del controlador ESP32 en la ruta.
   * @param query beforeId opcional: cursor exclusivo por id descendente, con hasta 50 registros por página.
   * @returns HTTP 200 con { items, nextBeforeId }; cada item contiene id, controllerId,
   * createdAt, expiresAt y revokedAt. Nunca devuelve el secreto ni su hash.
   * nextBeforeId es el último id si se obtienen 50 registros; de lo contrario, null.
   * @throws NotFoundException (404) si el controlador no existe.
   */
  @Get(':id/credentials')
  @Header('Cache-Control', 'no-store')
  listCredentials(
    @Param('id', DatabaseIdPipe) id: string,
    @Query() query: ControllerPageDto,
  ) {
    return this.controllers.listCredentials(id, query.beforeId);
  }

  /**
   * DELETE /controllers/:id/credentials/:credentialId: revoca una credencial individual.
   * Conserva su registro y establece revokedAt; no elimina el controlador ni otras credenciales.
   * @param id Identificador del controlador ESP32 propietario de la credencial.
   * @param credentialId Identificador de la credencial que debe revocarse.
   * @returns HTTP 204 sin cuerpo, también si la credencial ya estaba revocada.
   * @throws NotFoundException (404) si el controlador no existe o la credencial no pertenece a él.
   */
  @Delete(':id/credentials/:credentialId')
  @Header('Cache-Control', 'no-store')
  @HttpCode(204)
  revoke(
    @Param('id', DatabaseIdPipe) id: string,
    @Param('credentialId', DatabaseIdPipe) credentialId: string,
  ) {
    return this.credentials.revoke(id, credentialId);
  }

  /**
   * GET /controllers/:id/sensors: lista los sensores registrados del controlador ESP32.
   * @param id Identificador del controlador ESP32 en la ruta.
   * @returns HTTP 200 con un arreglo ordenado por id ascendente; cada sensor contiene
   * id, controllerId, type, unit y connectionStatus. Devuelve [] si no hay sensores.
   * Estos id se configuran como sensorId en el firmware; no se incluyen mediciones.
   * @throws NotFoundException (404) si el controlador no existe.
   */
  @Get(':id/sensors')
  @Header('Cache-Control', 'no-store')
  sensors(@Param('id', DatabaseIdPipe) id: string) {
    return this.controllers.sensors(id);
  }

  /**
   * POST /controllers/:id/sensors: registra un sensor físico asociado al controlador ESP32.
   * Solo crea su registro; no configura pines, drivers ni calibración de la placa.
   * @param id Identificador del controlador ESP32 en la ruta.
   * @param dto Cuerpo con type (Temperatura, HumedadSuelo, NivelAgua o HumedadAmbiental)
   * y unit opcional: °C para temperatura; % para humedad y nivel. Omitirla usa la unidad fija.
   * @returns HTTP 201 con id generado, controllerId, type, unit y connectionStatus=Desconectado.
   * @throws NotFoundException (404) si el controlador no existe.
   * @throws ConflictException (409) si ya tiene un sensor del mismo tipo.
   * La restricción actual todavía impide registrar dos sensores de humedad del suelo en un mismo controlador.
   */
  @Post(':id/sensors')
  @Header('Cache-Control', 'no-store')
  createSensor(
    @Param('id', DatabaseIdPipe) id: string,
    @Body() dto: CreateSensorDto,
  ) {
    return this.controllers.createSensor(id, dto);
  }
}
