import { SetMetadata } from '@nestjs/common';
import { Role } from '../../users/role.enum';

export const ROLES_KEY = 'auth:roles';

/**
 * Permite cualquiera de los roles indicados, sin jerarquía automática entre ellos.
 * @param roles Roles admitidos; sin argumentos basta con estar autenticado.
 * @returns Decorador para un controlador o método; el método reemplaza la lista del controlador.
 */
export const Roles = (...roles: Role[]) => SetMetadata(ROLES_KEY, roles);
