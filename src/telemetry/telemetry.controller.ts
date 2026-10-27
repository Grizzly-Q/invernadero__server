import { Body, Controller, Header, HttpCode, Post, Req } from '@nestjs/common';
import { DeviceOnly } from '../auth/decorators/device-only.decorator';
import type { ControllerRequest } from '../controllers/controller.types';
import { ReceiveTelemetryDto } from './dto/receive-telemetry.dto';
import { TelemetryService } from './telemetry.service';

/**
 * Recepción de mediciones históricas mediante HTTPS para controladores ESP32.
 * Todas sus rutas exigen Authorization: Bearer con una credencial individual vigente
 * de un controlador activo; no aceptan JWT de usuarios humanos.
 */
@Controller('telemetry')
@DeviceOnly()
export class TelemetryController {
  constructor(private readonly telemetry: TelemetryService) {}

  /**
   * POST /telemetry: guarda un lote de lecturas en una única transacción.
   * @param request Petición cuya identidad controller fue establecida por el guard, no por el JSON.
   * @param dto Cuerpo { readings: [...] } con entre 1 y 100 lecturas. Cada una contiene sensorId
   * (bigint como cadena), readingId (1 a 100 caracteres alfanuméricos, guiones o dos puntos,
   * sin prefijo reservado historica:), value (-273.15 a 99999.99 para temperatura; otros tipos desde 0, hasta dos decimales)
   * y measuredAt opcional (fecha ISO con zona o null si el ESP32 desconoce la hora).
   * Los porcentajes de humedad y los sensores con unidad % no pueden superar 100.
   * @returns HTTP 200 con { controllerId, received, inserted, duplicates }, también para reintentos.
   * Un mismo sensorId y readingId con idéntico valor y fecha cuenta como duplicado y no se reinserta.
   * Registra la recepción en el servidor, actualiza la última comunicación del controlador ESP32
   * y marca como Conectado al controlador y a los sensores del lote. No altera recepciones anteriores.
   * @throws BadRequestException (400) si el lote es inválido, repite una identidad de lectura
   * dentro del mismo envío o la fecha medida adelanta más de cinco minutos al servidor.
   * @throws UnauthorizedException (401) si la credencial no autoriza un controlador ESP32 activo.
   * @throws ForbiddenException (403) si algún sensor no pertenece al controlador autenticado o no existe.
   * @throws ConflictException (409) si un readingId del sensor ya existe con distinto valor o fecha.
   * Cualquier error revierte el lote completo y sus actualizaciones de comunicación.
   */
  @Post()
  @HttpCode(200)
  @Header('Cache-Control', 'no-store')
  receive(@Req() request: ControllerRequest, @Body() dto: ReceiveTelemetryDto) {
    return this.telemetry.receive(request.controller, dto);
  }
}
