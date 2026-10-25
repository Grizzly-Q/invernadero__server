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

Las entidades de invernaderos, controladores, credenciales, cuentas y sesiones de usuario, sensores y mediciones tienen mapeo explícito a las tablas PostgreSQL. Las entidades se comparten con la CLI de migraciones. Las tablas restantes aún no están modeladas como entidades.

La [guía de migraciones](migrations/README.md) documenta el esquema inicial, los cambios, la conservación del historial, los comandos de ejecución y las limitaciones de reversión.

La consulta de diagnóstico usa `DataSource.query()`. Registro y login utilizan ahora la tabla `Usuario`. `uuid_Usuario` identifica públicamente la cuenta y `correo_Usuario` permite autenticarla sin alterar las relaciones bigint existentes. `SesionUsuario` referencia el UUID con clave foránea y guarda solo el hash SHA-256 del refresh, su expiración y revocación. No guarda el JWT de acceso ni necesita cifrado reversible. La migración `1792771200008-PersistirCuentasYRefresh` transforma la tabla de sesiones previa y conserva las sesiones anteriores en SesionUsuarioLegado. Las cuentas históricas sin correo se conservan.

Las migraciones se preparan en código y se ejecutan explícitamente; iniciar la API no modifica el esquema. Consultar el impacto y la reversión en la [guía de migraciones](migrations/README.md). La migración `1792771200009-RolesPorInvernadero` traslada los permisos a UsuarioInvernadero. El rol anterior se archiva únicamente para reversión y ya no autoriza operaciones. El aprovisionamiento ESP32 y la recepción de telemetría conservan sus relaciones existentes.

[Configuración del entorno](../config/README.md) · [Usuarios](../users/README.md) · [Volver al README principal](../../README.md).
