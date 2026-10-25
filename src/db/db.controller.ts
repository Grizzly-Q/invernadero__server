import { Controller, Get } from '@nestjs/common';
import { DbService } from './db.service.js';
import { Public } from '../auth/decorators/public.decorator';

/** Consulta pública de diagnóstico de acceso a PostgreSQL; no administra registros. */
@Controller('db')
export class DbController {
  /** Recibe el servicio que ejecuta la consulta de prueba. */
  constructor(private readonly dbService: DbService) {}

  /**
   * GET /db/prueba: ejecuta una consulta de lectura sobre public.Usuario sin exigir JWT.
   * No recibe parámetros y no devuelve registros individuales ni contraseñas.
   * @returns HTTP 200 con { hora, total }: hora de PostgreSQL serializada como fecha ISO
   * y cantidad de filas de public.Usuario como cadena decimal, no como número JavaScript.
   * Incluye también cuentas históricas sin correo, que no pueden iniciar sesión en la API.
   * @throws Error de PostgreSQL si falla la conexión o el acceso a la tabla;
   * al no traducirse aquí, el manejador global responde HTTP 500.
   */
  @Public()
  @Get('prueba')
  probarConsulta() {
    return this.dbService.probarConsulta();
  }
}
