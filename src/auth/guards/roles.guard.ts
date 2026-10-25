import {
  BadRequestException,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { DataSource } from 'typeorm';
import { ControllerEntity } from '../../controllers/entities/controller.entity';
import { GreenhouseAccessService } from '../../greenhouses/greenhouse-access.service';
import { isDatabaseId } from '../../db/database-id';
import { Role } from '../../users/role.enum';
import type { AuthenticatedRequest } from '../auth.types';
import { ROLES_KEY } from '../decorators/roles.decorator';
import { CONTROLLER_SCOPE_KEY } from '../decorators/controller-scope.decorator';

/** Resuelve el propietario del recurso antes de comprobar roles; nunca usa un rol global. */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly access: GreenhouseAccessService,
    private readonly source: DataSource,
  ) {}

  /** Exige pertenencia con un rol permitido; una ruta con roles sin ámbito explícito se deniega. */
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const targets = [context.getHandler(), context.getClass()];
    const roles = this.reflector.getAllAndOverride<Role[]>(ROLES_KEY, targets);
    if (!roles?.length) return true;
    const request = context.switchToHttp().getRequest<AuthenticatedRequest>();
    if (
      !request.user ||
      !this.reflector.getAllAndOverride<boolean>(CONTROLLER_SCOPE_KEY, targets)
    )
      throw new ForbiddenException('No se definió un ámbito autorizado.');
    let greenhouseId: unknown;
    if (request.params.id) {
      const id = request.params.id;
      if (!isDatabaseId(id))
        throw new BadRequestException('Identificador inválido.');
      const controller = await this.source
        .getRepository(ControllerEntity)
        .findOneBy({ id });
      if (!controller)
        throw new NotFoundException('Controlador no encontrado.');
      greenhouseId = controller.greenhouseId;
    } else {
      greenhouseId = (request.body as { greenhouseId?: unknown } | undefined)
        ?.greenhouseId;
    }
    if (!isDatabaseId(greenhouseId))
      throw new BadRequestException('Invernadero inválido.');
    await this.access.require(request.user.id, greenhouseId, roles);
    return true;
  }
}
