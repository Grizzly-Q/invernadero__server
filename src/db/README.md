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

## Datos de prueba

Con las tablas del esquema SQL ya creadas y `DATABASE_URL` y `JWT_SECRET`
configurados en `.env`, ejecuta `npm run seed` (en PowerShell puedes usar
`npm.cmd run seed`). El comando compila el proyecto antes de iniciar Nest.

En una base vacía inserta 2 usuarios, 2 invernaderos, 2 asignaciones,
2 controladores, 6 sensores, 6 límites, 18 mediciones, 2 configuraciones,
2 horarios, 6 notificaciones y 4 ejecuciones de riego. Todas las inserciones
se realizan en una transacción. Las fechas de ejemplo son del 1 de octubre de 2026.
Ejecuta una sola instancia del seed a la vez: algunas comprobaciones de existencia
no tienen una restricción única que proteja contra ejecuciones concurrentes.

Los usuarios nuevos usan el hash `scrypt` de `PasswordService`. Los usuarios
existentes se conservan, incluidas sus contraseñas; repetir el seed no migra
hashes bcrypt anteriores. Las cuentas de prueba son `seed_admin_demo`
(`AdminDemo2026!`) y `seed_operador_demo` (`OperadorDemo2026!`).
Estas cuentas todavía no pueden iniciar sesión en la API: el login usa correo
y usuarios en memoria, mientras que el esquema SQL identifica usuarios por nombre.

## Persistencia de usuarios

La consulta usa `DataSource.query()`. El registro y el inicio de sesión todavía utilizan usuarios en memoria: no insertan ni consultan la tabla `Usuario`. Antes de completar la persistencia hay que definir las entidades y conectar los servicios con sus repositorios.

[Configuración del entorno](../config/README.md) · [Usuarios](../users/README.md) · [Volver al README principal](../../README.md).
