import { Controller, Get } from '@nestjs/common';
import { Roles } from '../auth/decorators/roles.decorator';
import { Role } from './role.enum';
import type { PublicUser } from './user.types';
import { UsersService } from './users.service';

/**
 * Consulta las cuentas humanas de la API persistidas en PostgreSQL.
 * Todas las rutas requieren Authorization: Bearer con JWT de un usuario ADMIN.
 * No representa la tabla Usuario de PostgreSQL ni los controladores ESP32.
 */
@Controller('users')
@Roles(Role.ADMIN)
export class UsersController {
  constructor(private readonly users: UsersService) {}

  /**
   * GET /users: lista los perfiles de todas las cuentas humanas registradas.
   * No recibe parámetros, filtros ni paginación y no modifica los registros.
   * @returns HTTP 200 con un arreglo de { id, name, email, role }, sin contraseñas ni hashes.
   * @throws UnauthorizedException (401) si falta un JWT válido con sesión vigente.
   * @throws ForbiddenException (403) si el usuario autenticado no tiene rol ADMIN.
   */
  @Get()
  findAll(): Promise<PublicUser[]> {
    return this.users.findAll();
  }
}
