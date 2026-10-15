import { SetMetadata } from '@nestjs/common';

export const IS_PUBLIC_KEY = 'auth:isPublic';

/** Permite acceder sin JWT a una ruta o controlador explícitamente público. */
export const Public = () => SetMetadata(IS_PUBLIC_KEY, true);
