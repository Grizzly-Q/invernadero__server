import {
  Body,
  Controller,
  Delete,
  Header,
  HttpCode,
  Param,
  ParseUUIDPipe,
  Put,
} from '@nestjs/common';
import { Roles } from '../../auth/decorators/roles.decorator';
import { Role } from '../../users/role.enum';
import { LinkMonitoringUserDto } from './monitoring.dto';
import { MonitoringAccessService } from './monitoring-access.service';

/**
 * Asociación administrativa entre cuentas humanas de la API y usuarios Operador de PostgreSQL.
 * Todas las rutas exigen JWT Bearer de un usuario ADMIN; otros roles reciben 403 y JWT inválidos, 401.
 * El vínculo se conserva en memoria y se pierde al reiniciar, igual que las cuentas actuales.
 * Sirve para autorizar tanto el monitoreo en vivo como el historial; no asigna invernaderos.
 */
@Controller('monitoring/users')
@Roles(Role.ADMIN)
export class MonitoringAdminController {
  constructor(private readonly access: MonitoringAccessService) {}

  /**
   * PUT /monitoring/users/:userId/database-identity: vincula una cuenta OPERATOR con un Operador existente.
   * Puede reemplazar el vínculo de esa cuenta; una identidad PostgreSQL no puede compartirse entre cuentas.
   * @param userId UUID versión 4 de la cuenta humana en memoria de la API, no un id de controlador ESP32.
   * @param dto Cuerpo { databaseUserId }: identificador bigint positivo como cadena del Usuario PostgreSQL.
   * @returns HTTP 200 con { userId, databaseUserId }, después de guardar el vínculo en memoria.
   * No crea usuarios PostgreSQL ni filas de UsuarioInvernadero; el acceso requiere asignaciones existentes.
   * @throws BadRequestException (400) si el UUID o el cuerpo son inválidos o contienen campos adicionales.
   * @throws NotFoundException (404) si la cuenta humana de la API no existe.
   * @throws ForbiddenException (403) si la cuenta no es OPERATOR o el Usuario PostgreSQL no existe o no es Operador.
   * @throws ConflictException (409) si otra cuenta ya utiliza esa identidad PostgreSQL.
   */
  @Put(':userId/database-identity')
  @Header('Cache-Control', 'no-store')
  link(
    @Param('userId', new ParseUUIDPipe({ version: '4' })) userId: string,
    @Body() dto: LinkMonitoringUserDto,
  ) {
    return this.access.link(userId, dto.databaseUserId);
  }

  /**
   * DELETE /monitoring/users/:userId/database-identity: retira el vínculo temporal de una cuenta humana.
   * @param userId UUID versión 4 de la cuenta de la API; no recibe cuerpo ni parámetros de consulta.
   * @returns HTTP 204 sin cuerpo, incluso si la cuenta no existe o no tenía vínculo.
   * No elimina usuarios ni asignaciones en PostgreSQL. Las siguientes consultas de historial comprobarán
   * nuevamente el vínculo; las conexiones en vivo lo revalidan durante su ciclo de comprobación.
   * @throws BadRequestException (400) si userId no es un UUID versión 4 válido.
   */
  @Delete(':userId/database-identity')
  @HttpCode(204)
  unlink(
    @Param('userId', new ParseUUIDPipe({ version: '4' })) userId: string,
  ): void {
    this.access.unlink(userId);
  }
}
