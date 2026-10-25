import { Controller, Get, Header, Param, Query } from '@nestjs/common';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { DatabaseIdPipe } from '../db/database-id';
import type { PublicUser } from '../users/user.types';
import { HistoryQueryDto } from './dto/history-query.dto';
import { HistoryService } from './history.service';

/**
 * Consulta del historial persistido para miembros del invernadero autenticados con JWT Bearer.
 * ADMIN y OPERATOR se verifican por pertenencia en PostgreSQL; no acepta credenciales ESP32.
 */
@Controller('telemetry/sensors')
export class HistoryController {
  constructor(private readonly history: HistoryService) {}

  /**
   * GET /telemetry/sensors/:sensorId/history: consulta mediciones y estadísticas sin modificar datos.
   * No requiere que el controlador ESP32 esté activo o conectado; excluye muestras rápidas no persistidas.
   * @param user Perfil humano establecido por el guard, usado para verificar el acceso al sensor.
   * @param sensorId Identificador bigint positivo del sensor, representado como cadena en la ruta.
   * @param query Filtros: period=day (últimas 24 horas, predeterminado) o week (últimos siete días);
   * alternativamente from y to juntos, en ISO con zona, sin period y con rango de hasta 31 días.
   * El inicio se incluye y el final se excluye. groupBy=none devuelve lecturas; hour agrupa por hora UTC.
   * page admite de 1 a 10000 (predeterminado 1); limit de 1 a 500 (predeterminado 100).
   * @returns HTTP 200 con sensor, range, groupBy, summary, pagination e items por fecha ascendente.
   * summary contiene count, minimum, maximum y average de todo el periodo, no solo de la página.
   * pagination contiene page, limit, total y hasNext; total cuenta lecturas o grupos según groupBy.
   * Los conteos son cadenas. Las muestras contienen id, readingId, value, measuredAt, receivedAt
   * y timestamp; los grupos contienen bucketStart, count, minimum, maximum y average.
   * Se utiliza la fecha medida o, si falta, la recepción. Las filas sin ninguna fecha se excluyen.
   * Un periodo vacío devuelve items=[], count="0" y estadísticas null; no rellena horas sin datos.
   * @throws BadRequestException (400) si el id, los filtros, la paginación o el rango son inválidos.
   * @throws UnauthorizedException (401) si falta un JWT válido con sesión vigente.
   * @throws ForbiddenException (403) si falta una pertenencia autorizada al invernadero.
   * @throws NotFoundException (404) si el sensor no existe.
   */
  @Get(':sensorId/history')
  @Header('Cache-Control', 'no-store')
  get(
    @CurrentUser() user: PublicUser,
    @Param('sensorId', DatabaseIdPipe) sensorId: string,
    @Query() query: HistoryQueryDto,
  ) {
    return this.history.get(user, sensorId, query);
  }
}
