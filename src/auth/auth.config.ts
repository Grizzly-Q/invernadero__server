/** Configuración validada al arrancar; los tiempos se expresan en segundos. */
export interface AuthConfig {
  secret: string;
  issuer: string;
  audience: string;
  accessTtl: number;
}

/** Rechaza secretos ausentes y duraciones inválidas antes de abrir el servidor. */
export function authConfig(): AuthConfig {
  const secret = process.env.JWT_SECRET;
  if (!secret || Buffer.byteLength(secret, 'utf8') < 32) {
    throw new Error('JWT_SECRET debe contener al menos 32 bytes.');
  }

  const seconds = (name: string, fallback: number): number => {
    const value = Number(process.env[name] ?? fallback);
    if (!Number.isSafeInteger(value) || value <= 0) {
      throw new Error(`${name} debe ser un entero positivo en segundos.`);
    }
    return value;
  };

  return {
    secret,
    issuer: process.env.JWT_ISSUER || 'invernadero-api',
    audience: process.env.JWT_AUDIENCE || 'invernadero-android',
    accessTtl: seconds('JWT_ACCESS_TTL_SECONDS', 900),
  };
}
