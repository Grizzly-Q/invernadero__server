import { SetMetadata } from '@nestjs/common';

export const CONTROLLER_SCOPE_KEY = 'auth:controller-scope';

/** Indica que los roles se consultan en el invernadero propietario del controlador de la ruta. */
export const ControllerScope = () => SetMetadata(CONTROLLER_SCOPE_KEY, true);
