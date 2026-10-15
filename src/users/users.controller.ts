import { Controller, Get } from '@nestjs/common';
import { Roles } from '../auth/decorators/roles.decorator';
import { Role } from './role.enum';
import type { PublicUser } from './user.types';
import { UsersService } from './users.service';

/** Ejemplo mínimo de un recurso reservado a administradores. */
@Controller('users')
@Roles(Role.ADMIN)
export class UsersController {
  constructor(private readonly users: UsersService) {}

  /** Devuelve perfiles de usuarios; el guard devuelve 403 a usuarios normales. */
  @Get()
  findAll(): PublicUser[] {
    return this.users.findAll();
  }
}
