Antes de arrancar, completar `DATABASE_URL` y `JWT_SECRET` en `.env`. Consultar la [guía de configuración](src/config/README.md). Por defecto, la API escucha en `http://localhost:3000`.
# Configuración y variables de entorno

La configuración está centralizada en esta carpeta:

- `auth.config.ts`: opciones JWT y validación de su duración.
- `db.config.ts`: opciones de conexión TypeORM.
- `environment.validation.ts`: reglas de las variables obligatorias.

`AppModule` registra la configuración mediante `ConfigModule`. Los servicios la consultan con `ConfigService`.

## Preparar el entorno

Copiar `.env.example` a `.env` y completar los valores obligatorios. No compartir ni incorporar el secreto JWT o la cadena PostgreSQL a Android ni al repositorio.

| Variable | Regla o valor predeterminado |
| --- | --- |
| `DATABASE_URL` | Obligatoria. URL `postgres://` o `postgresql://` con servidor y nombre de base de datos. Copiarla desde **Connect** en Supabase y completar las credenciales; no usar la URL HTTPS del proyecto. |
| `JWT_SECRET` | Obligatoria. Al menos 32 bytes y no compuesta únicamente por espacios. |
| `JWT_ISSUER` | `invernadero-api`. |
| `JWT_AUDIENCE` | `invernadero-clientes`. |
| `JWT_ACCESS_TTL_SECONDS` | Entero positivo en segundos; por defecto `900` (15 minutos). |
| `JWT_REFRESH_TTL_SECONDS` | Entero positivo; `604800` (7 días), vencimiento absoluto de sesión. |
| `WEB_ORIGINS` | Orígenes HTTP(S) exactos separados por comas, sin barra final; `http://localhost:5173`. |
| `COOKIE_SECURE` | `true` activa HTTPS para cookies locales; producción siempre lo fuerza. |
| `COOKIE_SAME_SITE` | `lax` por defecto; también `strict` o `none`. `none` exige Secure y HTTPS. |
| `PORT` | Por defecto `3000`; lo utiliza el arranque de la API. |

Generar el secreto JWT:

```powershell
node -e "console.log(require('node:crypto').randomBytes(48).toString('hex'))"
```

Guardar el resultado en `JWT_SECRET`; en Cloudflare usar un Worker secret. La clave debe ser estable: cambiarla invalida todos los tokens. Ya no se utiliza `TOKEN_ENCRYPTION_KEY`, porque se almacena un hash del refresh. Las variables de cookies y renovación se reenvían al contenedor desde el Worker. React permanece en `http://localhost:5173`. El archivo `.env`, su ejemplo y Wrangler están configurados para consumir la API HTTPS de Cloudflare con `WEB_ORIGINS=http://localhost:5173`, `COOKIE_SECURE=true` y `COOKIE_SAME_SITE=none`. No hace falta publicar React.

Ya no se crea un administrador global al arrancar. El registro crea una cuenta sin rol global. Crear un invernadero registra al creador como ADMIN en UsuarioInvernadero dentro de la misma transacción. Los permisos se comprueban por invernadero; las invitaciones internas se implementarán después.

## Cómo se valida

`ConfigModule` combina `.env` con el entorno del proceso; el proceso tiene prioridad. `validateEnvironment` utiliza `plainToInstance` de `class-transformer` y `validateSync` de `class-validator`. Las variables adicionales se conservan y las credenciales no se modifican.

Los errores de las variables obligatorias detienen el arranque antes de crear los servicios e identifican las variables inválidas sin mostrar sus valores. La validación comprueba el formato, no la conectividad ni los permisos de PostgreSQL. La duración JWT y las opciones de cookies se validan en `auth.config.ts`. `PORT` no tiene validación adicional por ahora.

[Base de datos](../db/README.md) · [Autenticación](../auth/README.md) · [Volver al README principal](../../README.md).

## React local con API en Cloudflare

La configuración preparada utiliza React en `http://localhost:5173` y la API remota mediante HTTPS. React debe enviar `credentials: 'include'` en login, refresh y logout. `COOKIE_SECURE=true` corresponde a la conexión con la API HTTPS: no exige publicar React ni cambiar su URL local a HTTPS.

Estos valores no son para una API local HTTP. Si se ejecuta también Nest en `http://localhost:3000`, usar `COOKIE_SECURE=false` y `COOKIE_SAME_SITE=lax` en ese entorno. Un navegador que bloquee cookies de terceros puede impedir la renovación con la API remota; SameSite=None no elimina esa restricción. Los cambios de Wrangler llegan al servidor después de desplegar.
