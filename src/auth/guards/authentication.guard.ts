import {
  Injectable,
  InternalServerErrorException,
  UnauthorizedException,
} from '@nestjs/common';
import type { CanActivate, ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request } from 'express';
import { ControllerCredentialsService } from '../../controllers/controller-credentials.service';
import type { ControllerRequest } from '../../controllers/controller.types';
import { AuthService } from '../auth.service';
import type { AuthenticatedRequest } from '../auth.types';
import { DEVICE_ONLY_KEY } from '../decorators/device-only.decorator';
import { IS_PUBLIC_KEY } from '../decorators/public.decorator';
import { ROLES_KEY } from '../decorators/roles.decorator';

/** Selecciona explícitamente credencial de equipo o JWT de usuario; exige JWT por defecto. */
@Injectable()
export class AuthenticationGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly auth: AuthService,
    private readonly controllers: ControllerCredentialsService,
  ) {}

  /** Incorpora una sola identidad verificada y rechaza configuraciones de acceso contradictorias. */
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const targets = [context.getHandler(), context.getClass()];
    const deviceOnly = this.reflector.getAllAndOverride<boolean>(
      DEVICE_ONLY_KEY,
      targets,
    );
    const isPublic = this.reflector.getAllAndOverride<boolean>(
      IS_PUBLIC_KEY,
      targets,
    );
    const roles = this.reflector.getAllAndOverride<unknown[]>(
      ROLES_KEY,
      targets,
    );
    if (deviceOnly && (isPublic || roles?.length))
      throw new InternalServerErrorException(
        'La ruta de equipos tiene una configuración de acceso incompatible.',
      );
    if (isPublic) return true;
    const request = context.switchToHttp().getRequest<Request>();
    const count =
      request.rawHeaders?.filter(
        (header, index) =>
          index % 2 === 0 && header.toLowerCase() === 'authorization',
      ).length ?? 0;
    const match = /^Bearer ([^\s]+)$/i.exec(
      request.headers.authorization ?? '',
    );
    if (count > 1 || !match || match[1].length > 2048)
      throw new UnauthorizedException(
        'Se requiere un único encabezado Authorization: Bearer <credencial>.',
      );
    if (deviceOnly) {
      (request as ControllerRequest).controller =
        await this.controllers.authenticate(match[1]);
    } else {
      const { user, sessionId } = await this.auth.authenticate(match[1]);
      (request as AuthenticatedRequest).user = user;
      (request as AuthenticatedRequest).sessionId = sessionId;
    }
    return true;
  }
}
