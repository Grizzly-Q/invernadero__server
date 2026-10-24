import { Injectable } from '@nestjs/common';
import type { ExecutionContext } from '@nestjs/common';
import { ThrottlerGuard } from '@nestjs/throttler';
import type { ControllerIdentity } from '../../controllers/controller.types';

/** Añade límites por equipo después de autenticar, además del límite global por IP. */
@Injectable()
export class ControllerThrottlerGuard extends ThrottlerGuard {
  /** Las rutas de personas mantienen únicamente el límite por IP ya aplicado. */
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context
      .switchToHttp()
      .getRequest<{ controller?: ControllerIdentity }>();
    return request.controller ? super.canActivate(context) : true;
  }

  /** Separa los contadores de equipo de los contadores por dirección IP. */
  protected getTracker(request: {
    controller: ControllerIdentity;
  }): Promise<string> {
    return Promise.resolve(`controller:${request.controller.id}`);
  }
}
