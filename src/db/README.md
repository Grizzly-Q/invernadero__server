# Base de datos

La API se conecta a PostgreSQL de Supabase mediante TypeORM y el driver `pg`. No utiliza el SDK de Supabase para esta conexión.

## Configuración

`AppModule` registra TypeORM con las opciones de [db.config.ts](../config/db.config.ts):

- `DATABASE_URL`: cadena de conexión leída con `ConfigService`.
- `autoLoadEntities: true`: incorpora las entidades registradas con `TypeOrmModule.forFeature()`; no descubre tablas automáticamente.
- `synchronize: false`: evita modificar automáticamente la estructura de las tablas. Los cambios deben aplicarse mediante SQL o migraciones.
- `poolSize: 3`: hasta tres conexiones por instancia de la API.
- `ssl: { rejectUnauthorized: false }`: cifra la conexión, pero no valida el certificado del servidor. La validación del certificado queda pendiente para producción.

## Consulta de prueba

`GET /db/prueba` es público porque tiene `@Public()`. Ejecuta:

```sql
SELECT NOW() AS hora, COUNT(*) AS total
FROM public."Usuario"
```

Devuelve la hora y el número de filas. Requiere una conexión válida, que exista exactamente `public."Usuario"` y permisos para leerla. Una conexión exitosa no garantiza que la tabla exista.

## Alcance actual

La consulta usa `DataSource.query()`. El registro y el inicio de sesión todavía utilizan usuarios en memoria: no insertan ni consultan la tabla `Usuario`. Antes de completar la persistencia hay que definir las entidades y conectar los servicios con sus repositorios.

[Configuración del entorno](../config/README.md) · [Usuarios](../users/README.md) · [Volver al README principal](../../README.md).
