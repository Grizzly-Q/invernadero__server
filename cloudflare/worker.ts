import { Container } from '@cloudflare/containers';

/** Variables del Worker; los secretos se proporcionan al arrancar el contenedor. */
interface Env {
  API: DurableObjectNamespace<InvernaderoContainer>;
  DATABASE_URL: string;
  JWT_SECRET: string;
  JWT_REFRESH_TTL_SECONDS?: string;
  WEB_ORIGINS?: string;
  COOKIE_SAME_SITE?: string;
  JWT_ISSUER: string;
  JWT_AUDIENCE: string;
  JWT_ACCESS_TTL_SECONDS: string;
}

/** Ejecuta NestJS en Node.js y permite acceso a PostgreSQL por Internet. */
export class InvernaderoContainer extends Container<Env> {
  defaultPort = 3000;
  sleepAfter = '10m';
  enableInternet = true;
  envVars = {
    NODE_ENV: 'production',
    PORT: '3000',
    DATABASE_URL: this.env.DATABASE_URL,
    JWT_SECRET: this.env.JWT_SECRET,
    JWT_REFRESH_TTL_SECONDS: this.env.JWT_REFRESH_TTL_SECONDS ?? '604800',
    WEB_ORIGINS: this.env.WEB_ORIGINS ?? 'http://localhost:5173',
    // El navegador accede desde React local a esta API HTTPS remota.
    COOKIE_SECURE: 'true',
    COOKIE_SAME_SITE: this.env.COOKIE_SAME_SITE ?? 'none',
    JWT_ISSUER: this.env.JWT_ISSUER,
    JWT_AUDIENCE: this.env.JWT_AUDIENCE,
    JWT_ACCESS_TTL_SECONDS: this.env.JWT_ACCESS_TTL_SECONDS,
  };
}

export default {
  /** Conserva ruta, método y cuerpo al reenviar la petición a una instancia fija. */
  fetch(request: Request, env: Env): Promise<Response> {
    return env.API.getByName('api').fetch(request);
  },
} satisfies ExportedHandler<Env>;
