# Usuarios

`UsersService` crea y consulta usuarios mediante un almacén temporal en memoria. Cada usuario tiene identificador, nombre, correo normalizado, un rol y un hash de contraseña reservado al servidor.

## Comportamiento actual

- El correo se recorta y convierte a minúsculas antes de buscarlo o guardarlo.
- Crear un correo duplicado produce **409 Conflict**, incluso con registros concurrentes en el mismo proceso.
- Los perfiles públicos no contienen contraseñas ni hashes.
- El registro público crea Operadores; la asignación de otros roles se realiza dentro del servidor.
- Las variables `ADMIN_EMAIL` y `ADMIN_PASSWORD` permiten crear el Administrador inicial al arrancar.

## Endpoint

`GET /users` lista perfiles y requiere JWT con rol Administrador. La restricción se declara en [users.controller.ts](users.controller.ts).

Para proteger otras rutas o permitir varios roles, consultar la [guía de autorización](../auth/authorization.md). Para registro e inicio de sesión, consultar [autenticación](../auth/README.md).

## Persistencia pendiente

Los usuarios desaparecen al reiniciar la API y cada proceso mantiene su propio almacén. La conexión TypeORM existente todavía no se utiliza para guardarlos. Antes de desplegar, implementar persistencia y una restricción única de correo en PostgreSQL. No hay un endpoint de administración de roles.

[Configuración](../config/README.md) · [Base de datos](../db/README.md) · [Volver al README principal](../../README.md).
