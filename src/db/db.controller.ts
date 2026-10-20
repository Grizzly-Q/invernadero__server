import { Controller, Get } from '@nestjs/common';
import { DbService } from './db.service.js';
import { Public } from '../auth/decorators/public.decorator';

@Controller('db')
export class DbController {
  /** Recibe el servicio que ejecuta la consulta de prueba. */
  constructor(private readonly dbService: DbService) {}

  /** Devuelve el resultado de la consulta de prueba sin exigir JWT. */
  @Public()
  @Get('prueba')
  probarConsulta() {
    return this.dbService.probarConsulta();
  }
}
