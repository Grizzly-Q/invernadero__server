/** Configuración validada al arrancar; los tiempos se expresan en segundos. */
export interface AuthConfig {
  secret: string;
  refreshTtl: number;
  webOrigins: string[];
  cookieSecure: boolean;
  cookieSameSite: 'lax' | 'none' | 'strict';
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
  const seconds = (name: string, fallback: number): number => {
    const value = Number(environment[name] ?? fallback);
    if (!Number.isSafeInteger(value) || value <= 0) {
      throw new Error(`${name} debe ser un entero positivo en segundos.`);
    }
    return value;
  };

  const webOrigins = (environment.WEB_ORIGINS || 'http://localhost:5173')
    .split(',')
    .map((origin) => origin.trim());
  if (
    webOrigins.some((origin) => {
      try {
        const url = new URL(origin);
        return (
          !['http:', 'https:'].includes(url.protocol) || url.origin !== origin
        );
      } catch {
        return true;
      }
    })
  )
    throw new Error(
      'WEB_ORIGINS debe contener orígenes HTTP(S) explícitos separados por comas.',
    );
  const sameSite = environment.COOKIE_SAME_SITE || 'lax';
  if (!['lax', 'strict', 'none'].includes(sameSite))
    throw new Error('COOKIE_SAME_SITE debe ser lax, strict o none.');
  if (
    sameSite === 'none' &&
    environment.NODE_ENV !== 'production' &&
    environment.COOKIE_SECURE !== 'true'
  )
    throw new Error('SameSite=None exige COOKIE_SECURE=true.');
  return {
    secret,
    refreshTtl: seconds('JWT_REFRESH_TTL_SECONDS', 604800),
    webOrigins,
    cookieSecure:
      environment.NODE_ENV === 'production' ||
      environment.COOKIE_SECURE === 'true',
    cookieSameSite: sameSite as AuthConfig['cookieSameSite'],
    issuer: environment.JWT_ISSUER || 'invernadero-api',
    audience: environment.JWT_AUDIENCE || 'invernadero-clientes',
    accessTtl: seconds('JWT_ACCESS_TTL_SECONDS', 900),
  };
}
