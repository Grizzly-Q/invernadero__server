import { SetMetadata } from '@nestjs/common';
import { Role } from '../../users/role.enum';

export const ROLES_KEY = 'auth:roles';

/** Exige uno de los roles indicados; sin argumentos basta con estar autenticado. */
export const Roles = (...roles: Role[]) => SetMetadata(ROLES_KEY, roles);
