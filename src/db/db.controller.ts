import { Controller, Get } from '@nestjs/common';
import { DbService } from './db.service.js';

@Controller('db')
export class DbController {
  //usa el serviciopara ejecutar la consulta
  constructor(private readonly dbService: DbService) {}

  //ejecucion de la consulta por la ruta/db/prueba
  @Get('prueba')
  probarConsulta() {
    return this.dbService.probarConsulta();
  }
}
