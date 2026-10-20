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
| `JWT_AUDIENCE` | `invernadero-android`. |
| `JWT_ACCESS_TTL_SECONDS` | Entero positivo en segundos; por defecto `900` (15 minutos). |
| `PORT` | Por defecto `3000`; lo utiliza el arranque de la API. |
| `ADMIN_EMAIL` | Opcional, junto con `ADMIN_PASSWORD`, para crear el Administrador inicial. |
| `ADMIN_PASSWORD` | Entre 8 y 128 caracteres; se debe configurar junto con `ADMIN_EMAIL`. |

Generar un secreto aleatorio con:

```powershell
node -e "console.log(require('node:crypto').randomBytes(48).toString('hex'))"
```

Guardar el resultado en `JWT_SECRET`. Sin las dos variables de administrador no se crea ese usuario inicial.

## Cómo se valida

`ConfigModule` combina `.env` con el entorno del proceso; el proceso tiene prioridad. `validateEnvironment` utiliza `plainToInstance` de `class-transformer` y `validateSync` de `class-validator`. Las variables adicionales se conservan y las credenciales no se modifican.

Los errores de las variables obligatorias detienen el arranque antes de crear los servicios e identifican las variables inválidas sin mostrar sus valores. La validación comprueba el formato, no la conectividad ni los permisos de PostgreSQL. La duración JWT se valida en `auth.config.ts` y el par de credenciales del Administrador se verifica en `UsersService` durante su inicialización. `PORT` no tiene validación adicional por ahora.

[Base de datos](../db/README.md) · [Autenticación](../auth/README.md) · [Volver al README principal](../../README.md).
