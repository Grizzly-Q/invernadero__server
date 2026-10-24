import { Controller, Get } from '@nestjs/common';
import { AppService } from './app.service';
import { Public } from './auth/decorators/public.decorator';

/** Ruta pública de bienvenida; no comprueba el estado de PostgreSQL ni de los sensores. */
@Controller()
export class AppController {
  constructor(private readonly appService: AppService) {}

  /**
   * GET /: devuelve el mensaje de bienvenida sin exigir autenticación.
   * No recibe parámetros y no modifica datos ni sesiones.
   * @returns HTTP 200 con el texto Hello World! proporcionado por AppService.
   * La respuesta es texto, no un objeto JSON de estado del sistema.
   */
  @Get()
  @Public()
  getHello(): string {
    return this.appService.getHello();
  }
}
