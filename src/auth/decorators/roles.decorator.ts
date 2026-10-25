import { SetMetadata } from '@nestjs/common';
import { Role } from '../../users/role.enum';

export const ROLES_KEY = 'auth:roles';

/**
 * Declara roles de pertenencia admitidos, sin jerarquía automática; requiere un ámbito explícito.
 * @param roles Roles del invernadero admitidos; sin argumentos la ruta debe aplicar su propio filtro de pertenencias.
 * @returns Decorador para un controlador o método; el método reemplaza la lista del controlador.
 */
export const Roles = (...roles: Role[]) => SetMetadata(ROLES_KEY, roles);
