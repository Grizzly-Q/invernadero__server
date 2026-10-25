# Autorización por invernadero

El JWT identifica una cuenta; no contiene ni concede roles globales. La respuesta de registro, login, refresh y `/auth/me` contiene `{ id, name, email }` como perfil. El cliente obtiene el rol de cada invernadero con `GET /greenhouses` o `GET /greenhouses/:id`.

`UsuarioInvernadero.rol_UsuarioInvernadero` almacena ADMIN u OPERATOR. Crear un invernadero registra al creador como ADMIN en la misma transacción. Una cuenta puede tener roles distintos en distintos invernaderos, o no pertenecer a ninguno. El correo o el nombre nunca otorgan pertenencia.

| Operación | Permiso |
| --- | --- |
| Crear invernadero | Cuenta autenticada |
| Consultar invernadero | ADMIN u OPERATOR de ese invernadero |
| Consultar miembros | ADMIN de ese invernadero |
| Administrar equipos, credenciales y sensores | ADMIN del invernadero propietario del equipo |
| Listar equipos administrativos | Solo equipos de invernaderos donde la cuenta es ADMIN |
| Consultar historial o monitoreo | ADMIN u OPERATOR del invernadero del sensor |

`RolesGuard` resuelve el invernadero del controlador a partir del recurso persistido; no confía en un `greenhouseId` alternativo del cuerpo cuando existe un equipo en la ruta. Al registrar un equipo, verifica el invernadero indicado. `@ControllerScope()` declara explícitamente ese ámbito y `@Roles()` indica los roles admitidos. Una ruta con roles y sin ámbito explícito se deniega. El listado de equipos aplica su filtro de pertenencias dentro de la consulta, sin dar acceso global al omitir el decorador de roles.

Historial y monitoreo comparten `MonitoringAccessService`, que consulta la pertenencia persistente al invernadero del sensor. Las conexiones en vivo vuelven a comprobarla durante su ciclo de autorización. No hay asociaciones de identidad en memoria ni un bypass para administradores.

Los endpoints de equipos ESP32 conservan `@DeviceOnly()`: verifican credenciales de equipo y no JWT humanos. No combinar este decorador con `@Public()` ni roles de pertenencia.

`GET /users` y las rutas administrativas de vínculos temporales de monitoreo fueron retiradas. Las invitaciones serán internas de la aplicación y no se implementan todavía. Tampoco hay rutas para quitar miembros, cambiar roles o borrar invernaderos; por ello el API actual no permite retirar al último administrador.

Consultar [invernaderos](../greenhouses/README.md), [autenticación](README.md) y [migraciones](../db/migrations/README.md).
