import type { Request } from 'express';
import type { ControllerEntity } from './entities/controller.entity';

/** Identidad de controlador ESP32 obtenida de una credencial verificada, nunca del cuerpo JSON. */
export interface ControllerIdentity {
  /** Identificador bigint del controlador ESP32 autenticado, conservado como cadena. */
  id: string;
  /** Identificador del invernadero al que pertenece el controlador ESP32. */
  greenhouseId: string;
  /** Identificador del registro de credencial que autorizó esta petición o conexión. */
  credentialId: string;
}

/** Petición que superó la autenticación exclusiva de controladores ESP32. */
export interface ControllerRequest extends Request {
  /** Identidad establecida por el guard después de comprobar la credencial Bearer del ESP32. */
  controller: ControllerIdentity;
}

/** Datos administrativos permitidos en respuestas, sin relaciones ni hashes. */
export type PublicController = Pick<
  ControllerEntity,
  | 'id'
  | 'greenhouseId'
  | 'name'
  | 'active'
  | 'connectionStatus'
  | 'createdAt'
  | 'lastSeenAt'
>;

/** Emisión de una clave que solo se devuelve en esta respuesta. */
export interface IssuedControllerCredential {
  /** Identificador del registro de credencial; sirve para revocarla, no para autenticar la placa. */
  id: string;
  /** Identificador del controlador ESP32 propietario. */
  controllerId: string;
  /** Secreto original con prefijo esp32_; se entrega una sola vez y se configura de forma privada en la placa. */
  credential: string;
  /** Esquema de la cabecera Authorization que debe usar el ESP32. */
  tokenType: 'Bearer';
  /** Fecha de creación registrada por el servidor. */
  createdAt: Date;
  /** Fecha de vencimiento; null indica que no hay vencimiento programado, aunque puede revocarse. */
  expiresAt: Date | null;
}

/**
 * Proyecta explícitamente el perfil público para evitar exponer relaciones o credenciales.
 * @param controller Entidad persistida del controlador ESP32; no se modifica.
 * @returns id, greenhouseId, name, active, connectionStatus, createdAt y lastSeenAt.
 */
export function publicController(
  controller: ControllerEntity,
): PublicController {
  const {
    id,
    greenhouseId,
    name,
    active,
    connectionStatus,
    createdAt,
    lastSeenAt,
  } = controller;
  return {
    id,
    greenhouseId,
    name,
    active,
    connectionStatus,
    createdAt,
    lastSeenAt,
  };
}
