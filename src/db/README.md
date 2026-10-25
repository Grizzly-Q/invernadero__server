# Base de datos

La API se conecta a PostgreSQL de Supabase mediante TypeORM y el driver `pg`. No utiliza el SDK de Supabase para esta conexión.

## Configuración

`AppModule` registra TypeORM con las opciones de [db.config.ts](../config/db.config.ts):

- `DATABASE_URL`: cadena de conexión leída con `ConfigService`.
- `autoLoadEntities: true`: incorpora las entidades registradas con `TypeOrmModule.forFeature()`; no descubre tablas automáticamente.
- `synchronize: false`: evita modificar automáticamente la estructura de las tablas. Los cambios deben aplicarse mediante SQL o migraciones.
- `poolSize: 3`: hasta tres conexiones por instancia de la API.
- `migrationsRun: false`: las migraciones se ejecutan explícitamente mediante la CLI, nunca al arrancar la API.
- `ssl: { rejectUnauthorized: false }`: cifra la conexión, pero no valida el certificado del servidor. La validación del certificado queda pendiente para producción.

## Consulta de prueba

`GET /db/prueba` es público porque tiene `@Public()`. Ejecuta:

```sql
SELECT NOW() AS hora, COUNT(*) AS total
FROM public."Usuario"
```

Devuelve la hora y el número de filas. Requiere una conexión válida, que exista exactamente `public."Usuario"` y permisos para leerla. Una conexión exitosa no garantiza que la tabla exista.

## Alcance actual

Las entidades de invernaderos, controladores, credenciales, sesiones de usuario, sensores y mediciones tienen mapeo explícito a las tablas PostgreSQL. Las entidades se comparten con la CLI de migraciones. Las tablas restantes aún no están modeladas como entidades.

La [guía de migraciones](migrations/README.md) documenta el esquema inicial, los cambios, la conservación del historial, los comandos de ejecución y las limitaciones de reversión.

La consulta usa `DataSource.query()`. Las cuentas de login se guardan en `CuentaAcceso`, separadas de `Usuario`, y las sesiones cifradas en `SesionUsuario`. Las migraciones `1792771200005-CrearSesionUsuario` y `1792771200006-CrearCuentaAcceso` crean esas tablas; el JWT se cifra con AES-256-GCM usando `TOKEN_ENCRYPTION_KEY`. Los usuarios bigint existentes de `Usuario` no se modifican. El aprovisionamiento de ESP32 y la recepción de telemetría utilizan repositorios y transacciones persistentes. Consultar [controllers](../controllers/README.md) y [telemetría](../telemetry/README.md).

[Configuración del entorno](../config/README.md) · [Usuarios](../users/README.md) · [Volver al README principal](../../README.md).
