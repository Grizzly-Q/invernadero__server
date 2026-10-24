import { BadRequestException, Injectable } from '@nestjs/common';
import { DataSource } from 'typeorm';
import type { PublicUser } from '../users/user.types';
import { MonitoringAccessService } from './monitoring/monitoring-access.service';
import type { HistoryQueryDto } from './dto/history-query.dto';

/** Resuelve ventanas móviles o explícitas sin depender de la zona horaria del servidor. */
export function historyRange(query: HistoryQueryDto, now = new Date()) {
  if (query.period && (query.from || query.to))
    throw new BadRequestException('No combinar period con from o to.');
  if (!!query.from !== !!query.to)
    throw new BadRequestException('from y to deben enviarse juntos.');
  const to = query.to ? new Date(query.to) : now;
  const from = query.from
    ? new Date(query.from)
    : new Date(to.getTime() - (query.period === 'week' ? 7 : 1) * 86400000);
  const duration = to.getTime() - from.getTime();
  if (!Number.isFinite(duration) || duration <= 0 || duration > 31 * 86400000)
    throw new BadRequestException(
      'El rango debe ser positivo y de hasta 31 días.',
    );
  return { from, to };
}

/** Consulta historial persistido con los mismos permisos de sensor que el monitoreo. */
@Injectable()
export class HistoryService {
  constructor(
    private readonly source: DataSource,
    private readonly access: MonitoringAccessService,
  ) {}

  /**
   * Devuelve estadísticas de todo el periodo y una página de muestras o grupos horarios UTC.
   * Usa fecha medida, o recepción si falta; el límite superior es exclusivo.
   * @throws ForbiddenException si el usuario no tiene acceso al invernadero.
   * @throws NotFoundException si el sensor no existe.
   * @throws BadRequestException si la combinación de filtros es inválida.
   */
  async get(user: PublicUser, sensorId: string, query: HistoryQueryDto) {
    const range = historyRange(query);
    const sensor = await this.access.sensor(user, sensorId);
    if (this.source.options.type !== 'postgres')
      throw new Error('El historial requiere PostgreSQL.');
    const table = `${this.source.driver.escape(this.source.options.schema ?? 'public')}."Medicion"`;
    // La fecha de recepción permite consultar lecturas tomadas sin reloj sincronizado.
    const time = 'COALESCE("medidoEn_Medicion", "recibidoEn_Medicion")';
    const where = `"idSensor_Medicion" = $1 AND ${time} >= $2 AND ${time} < $3`;
    const parameters = [sensorId, range.from, range.to];
    return this.source.transaction('REPEATABLE READ', async (manager) => {
      const [summary] = await manager.query<
        Array<{
          count: string;
          minimum: number | null;
          maximum: number | null;
          average: number | null;
        }>
      >(
        `SELECT COUNT(*)::text AS count, MIN(valor)::float8 AS minimum,
         MAX(valor)::float8 AS maximum, AVG(valor)::float8 AS average FROM ${table} WHERE ${where}`,
        parameters,
      );
      const grouped = query.groupBy === 'hour';
      const bucket = `date_trunc('hour', ${time}, 'UTC')`;
      const [total] = grouped
        ? await manager.query<Array<{ count: string }>>(
            `SELECT COUNT(DISTINCT ${bucket})::text AS count FROM ${table} WHERE ${where}`,
            parameters,
          )
        : [summary];
      const selection = grouped
        ? `${bucket} AS "bucketStart", COUNT(*)::text AS count, MIN(valor)::float8 AS minimum,
           MAX(valor)::float8 AS maximum, AVG(valor)::float8 AS average`
        : `"idMedicion_Medicion"::text AS id, "idLectura_Medicion" AS "readingId",
           valor::float8 AS value, "medidoEn_Medicion" AS "measuredAt",
           "recibidoEn_Medicion" AS "receivedAt", ${time} AS "timestamp"`;
      const order = grouped
        ? `GROUP BY ${bucket} ORDER BY ${bucket}`
        : `ORDER BY ${time}, "idMedicion_Medicion"`;
      const items: unknown[] = await manager.query(
        `SELECT ${selection} FROM ${table} WHERE ${where} ${order} LIMIT $4 OFFSET $5`,
        [...parameters, query.limit, (query.page - 1) * query.limit],
      );
      return {
        sensor: {
          id: sensor.id,
          controllerId: sensor.controllerId,
          type: sensor.type,
          unit: sensor.unit,
        },
        range: { from: range.from.toISOString(), to: range.to.toISOString() },
        groupBy: query.groupBy,
        summary,
        pagination: {
          page: query.page,
          limit: query.limit,
          total: total.count,
          hasNext:
            BigInt(query.page) * BigInt(query.limit) < BigInt(total.count),
        },
        items,
      };
    });
  }
}
