# Invernaderos y pertenencias

Una cuenta no tiene un rol global. `UsuarioInvernadero` asigna ADMIN u OPERATOR por pareja usuario–invernadero y conserva su clave primaria compuesta, que impide pertenencias duplicadas. Una persona puede administrar uno y ser operadora en otro.

| Método | Ruta                       | Comportamiento                                                                     |
| ------ | -------------------------- | ---------------------------------------------------------------------------------- |
| POST   | `/greenhouses`             | Crea un invernadero y asigna ADMIN al creador autenticado en la misma transacción. |
| GET    | `/greenhouses`             | Lista solo pertenencias propias, con rol, hasta 50 por página y cursor `beforeId`. |
| GET    | `/greenhouses/:id`         | Devuelve un invernadero propio y el rol de esa pertenencia.                        |
| PATCH  | `/greenhouses/:id`         | Edita datos generales; exige ADMIN de ese invernadero. |
| PATCH  | `/greenhouses/:id/status`  | Cambia el estado; desactivar bloquea su equipo y conserva datos e historial. |
| GET    | `/greenhouses/:id/members` | Lista miembros para ADMIN de ese invernadero, hasta 100 por página con `beforeId`. |

Todas las rutas exigen `Authorization: Bearer <accessToken>` y responden con `Cache-Control: no-store`. Una cuenta nueva recibe una lista vacía hasta crear su primer invernadero o tener una asignación válida. Los IDs de invernadero son cadenas bigint; los IDs de cuenta son UUID.

Ejemplo de creación:

```json
{
  "name": "Cultivo de tomates",
  "location": "Lima",
  "length": 10,
  "width": 5,
  "height": 3,
  "description": "Invernadero de prueba"
}
```

`height` y `description` son opcionales. Las dimensiones admiten dos decimales, son positivas y no superan 999999.99. `name` se recorta y admite de 1 a 100 caracteres; `location`, de 1 a 200; `description`, hasta 500. Campos adicionales como `role`, `userId` o `ownerId` producen 400. No se acepta un propietario enviado por el cliente.

Crear devuelve 201 con el perfil del invernadero y `role: "ADMIN"`; consultar o listar devuelve el rol persistido actual. Una consulta ajena produce 403. Si falla la escritura de la pertenencia, se revierte también la creación del invernadero.

## Edición y desactivación

`PATCH /greenhouses/:id` acepta cambios parciales en name, location, length, width, height y description, con los mismos límites de creación. Omitir un campo conserva su valor; height y description admiten null para borrarlos. Los demás campos rechazan null. Un cuerpo vacío conserva los datos. No admite status, operationMode, role, propietario ni equipos; los campos ajenos producen 400. Las dimensiones se guardan como numeric y se devuelven como cadenas.

`PATCH /greenhouses/:id/status` recibe `{ "status": "Desactivado" }`, `{ "status": "Activo" }` o `{ "status": "EnMantenimiento" }`. Editar un nombre no reactiva el recurso. Todas las transiciones conservan pertenencias, sensores, credenciales e historial. No son operaciones de eliminación.

Ambas escrituras requieren ADMIN comprobado en PostgreSQL dentro de la transacción. La pertenencia se bloquea con FOR SHARE mientras se aplica el cambio, y el invernadero con FOR UPDATE para serializar escrituras. Sin pertenencia o como OPERATOR se responde 403. El formato inválido del identificador produce 400 y un recurso inexistente tras la autorización produce 404.

Desactivar bloquea también la fila del ESP32 y establece active=false y connectionStatus=Desconectado; sus sensores se marcan Desconectado en la misma transacción. Se utiliza el mismo bloqueo del controlador que la ingesta, por lo que las lecturas en curso se serializan con la desactivación. Un fallo revierte el cambio de estado y del equipo. Repetir la desactivación mantiene el resultado y no revoca credenciales. Los canales abiertos dejan de autorizarse al revalidar la identidad del equipo.

Registrar un nuevo ESP32 o habilitar sus comunicaciones se rechaza mientras el invernadero esté Desactivado. Registro, habilitación y desactivación bloquean siempre invernadero antes que controlador para evitar carreras e inversión de bloqueos. Reactivar el invernadero no habilita automáticamente su ESP32; el administrador debe hacerlo expresamente y conservar una credencial vigente. EnMantenimiento conserva las comunicaciones autorizadas y el historial sigue siendo consultable en cualquier estado.

Se usan columnas existentes, sin migración ni borrado de datos. Desactivar comunicaciones no envía una orden física de apagado a bombas o relés: el control de actuadores tiene un protocolo independiente que no forma parte de estas rutas.

ADMIN registra, activa o bloquea equipos, administra credenciales y registra sensores solamente en sus invernaderos. ADMIN y OPERATOR pueden consultar historial y solicitar monitoreo de sus sensores. No existe un administrador con acceso universal ni se publican listados globales de cuentas. `/users` y las antiguas rutas `/monitoring/users/:id/database-identity` se retiraron. Las invitaciones internas, cambios de rol, bajas de miembros y eliminación de invernaderos están fuera del alcance actual; no hay rutas que permitan eliminar al último administrador.

La pertenencia se consulta en PostgreSQL en cada operación; no hay vínculos humanos temporales. El monitoreo revalida permisos durante la conexión. La migración `1792771200009-RolesPorInvernadero` debe aplicarse antes de arrancar esta versión. Conserva asignaciones históricas y traduce sus roles anteriores; no inventa propietarios para invernaderos sin administrador. Esos registros requieren identificar al dueño real y asignarlo expresamente en la base antes de administrarlos. Las nuevas creaciones siempre reciben un administrador.

Las pruebas unitarias comprueban creación transaccional, acceso cruzado y consulta de pertenencias sin caché. Las pruebas HTTP completas de `test/greenhouses.e2e-spec.ts` requieren `AUTH_TEST_DATABASE_URL` y utilizan un esquema desechable.
