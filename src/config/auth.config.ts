/** Configuración validada al arrancar; los tiempos se expresan en segundos. */
export interface AuthConfig {
  secret: string;
  tokenEncryptionKey: Buffer;
  issuer: string;
  audience: string;
  accessTtl: number;
}

/**
 * Construye la configuración JWT sin modificar el entorno recibido.
 * @param environment Variables que se validarán; por defecto utiliza el entorno del proceso.
 * @returns Configuración JWT con los valores opcionales predeterminados.
 * @throws Error si el secreto está vacío, tiene menos de 32 bytes o la duración es inválida.
 */
export function authConfig(
  environment: Record<string, string | undefined> = process.env,
): AuthConfig {
  const secret = environment.JWT_SECRET;
  if (!secret?.trim() || Buffer.byteLength(secret, 'utf8') < 32) {
    throw new Error('JWT_SECRET debe contener al menos 32 bytes.');
  }
  const encodedEncryptionKey = environment.TOKEN_ENCRYPTION_KEY;
  const tokenEncryptionKey = Buffer.from(encodedEncryptionKey ?? '', 'base64');
  if (
    !encodedEncryptionKey ||
    tokenEncryptionKey.length !== 32 ||
    tokenEncryptionKey.toString('base64') !== encodedEncryptionKey
  ) {
    throw new Error(
      'TOKEN_ENCRYPTION_KEY debe ser Base64 de una clave aleatoria de 32 bytes.',
    );
  }

  const seconds = (name: string, fallback: number): number => {
    const value = Number(environment[name] ?? fallback);
    if (!Number.isSafeInteger(value) || value <= 0) {
      throw new Error(`${name} debe ser un entero positivo en segundos.`);
    }
    return value;
  };

  return {
    secret,
    tokenEncryptionKey,
    issuer: environment.JWT_ISSUER || 'invernadero-api',
    audience: environment.JWT_AUDIENCE || 'invernadero-android',
    accessTtl: seconds('JWT_ACCESS_TTL_SECONDS', 900),
  };
}
