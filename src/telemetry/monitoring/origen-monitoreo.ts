/** Aplica la lista web existente al handshake Socket.IO; no sustituye JWT ni permisos por sensor.
 * Origin ausente permite clientes nativos, que siguen obligados a autenticarse; null, vacíos y listas se rechazan.
 */
export function origenMonitoreoPermitido(
  origin: unknown,
  permitidos: readonly string[],
): boolean {
  return (
    origin === undefined ||
    (typeof origin === 'string' && permitidos.includes(origin))
  );
}
