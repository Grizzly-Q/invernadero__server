# Usuarios

`UsersService` crea y consulta cuentas persistentes en `Usuario`, con UUID público, nombre, correo normalizado y hash de contraseña. No asigna ni expone roles globales. La clave bigint histórica se conserva para las relaciones de negocio. Los ESP32 tienen credenciales independientes y no son cuentas humanas.

Registro y login no asignan invernaderos. Crear un invernadero añade una pertenencia ADMIN para el creador en la misma transacción. Los roles se consultan por invernadero; una persona puede ser ADMIN en uno y OPERATOR en otro. Consultar [invernaderos](../greenhouses/README.md).

El correo es único y normalizado; duplicarlo produce 409 incluso entre procesos. El nombre visible admite duplicados. Los perfiles públicos `{ id, name, email }` omiten contraseñas y hashes; el hash solo se selecciona internamente para verificar credenciales.

Las cuentas históricas sin correo permanecen en la base y requieren completarse antes de iniciar sesión. La aplicación no vincula cuentas automáticamente por nombre. El rol anterior se conserva en `rolHistorico_Usuario` únicamente para reversión de la migración y no se consulta para autorizar.

No se crean administradores al arrancar ni existe un listado global `/users`. ADMIN solo puede listar miembros de su propio invernadero con `/greenhouses/:id/members`. Las invitaciones internas siguen fuera del alcance.

`SesionUsuario` referencia el UUID con clave foránea y elimina sus filas al borrar la cuenta. Las sesiones y pertenencias sobreviven reinicios. Consultar [autenticación](../auth/README.md) y [migraciones](../db/migrations/README.md).
