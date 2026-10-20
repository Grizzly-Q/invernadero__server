import { Role } from './role.enum';

/** Datos que pueden exponerse a clientes; nunca incluyen el hash de contraseña. */
export interface PublicUser {
  id: string;
  name: string;
  email: string;
  /** Cada usuario tiene un único rol asignado por el servidor. */
  role: Role;
}

/** Registro interno de credenciales, reservado al servidor. */
export interface UserRecord extends PublicUser {
  passwordHash: string;
}
