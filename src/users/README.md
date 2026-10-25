# Usuarios

`UsersService` persiste en PostgreSQL las cuentas de acceso de la API en `CuentaAcceso`. Cada cuenta tiene UUID, nombre, correo normalizado, rol y hash de contraseña reservado al servidor. La tabla es distinta de `public.Usuario`, que contiene IDs bigint usados por funciones existentes de monitoreo y asignaciones.

Los roles de usuario son `ADMIN` y `OPERATOR`. Los equipos ESP32 se separan en el [módulo controllers](../controllers/README.md); no se registran como usuarios.

## Comportamiento actual

- El correo se recorta y convierte a minúsculas antes de buscarlo o guardarlo.
- Crear un correo duplicado produce **409 Conflict** mediante una restricción única en PostgreSQL, incluso con registros concurrentes.
- Los perfiles públicos no contienen contraseñas ni hashes.
- El registro público crea Operadores; la asignación de otros roles se realiza dentro del servidor.
- Las variables `ADMIN_EMAIL` y `ADMIN_PASSWORD` permiten crear el Administrador inicial al arrancar.

## Endpoint

`GET /users` lista perfiles y requiere JWT con rol Administrador. La restricción se declara en [users.controller.ts](users.controller.ts).

Para proteger otras rutas o permitir varios roles, consultar la [guía de autorización](../auth/authorization.md). Para registro e inicio de sesión, consultar [autenticación](../auth/README.md).

## Roles y alcance

El registro público siempre asigna `OPERATOR`; no acepta el rol enviado por el cliente. `ADMIN_EMAIL` y `ADMIN_PASSWORD` siguen permitiendo aprovisionar una cuenta administrativa global desde el servidor. La administración de un invernadero específico se coordina por separado y no se implementa aquí. No hay un endpoint público para cambiar roles.

[Configuración](../config/README.md) · [Base de datos](../db/README.md) · [Volver al README principal](../../README.md).
