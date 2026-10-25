# Invernaderos y pertenencias

Una cuenta no tiene un rol global. `UsuarioInvernadero` asigna ADMIN u OPERATOR por pareja usuario–invernadero y conserva su clave primaria compuesta, que impide pertenencias duplicadas. Una persona puede administrar uno y ser operadora en otro.

| Método | Ruta                       | Comportamiento                                                                     |
| ------ | -------------------------- | ---------------------------------------------------------------------------------- |
| POST   | `/greenhouses`             | Crea un invernadero y asigna ADMIN al creador autenticado en la misma transacción. |
| GET    | `/greenhouses`             | Lista solo pertenencias propias, con rol, hasta 50 por página y cursor `beforeId`. |
| GET    | `/greenhouses/:id`         | Devuelve un invernadero propio y el rol de esa pertenencia.                        |
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

ADMIN registra, activa o bloquea equipos, administra credenciales y registra sensores solamente en sus invernaderos. ADMIN y OPERATOR pueden consultar historial y solicitar monitoreo de sus sensores. No existe un administrador con acceso universal ni se publican listados globales de cuentas. `/users` y las antiguas rutas `/monitoring/users/:id/database-identity` se retiraron. Las invitaciones internas, cambios de rol, bajas de miembros y eliminación de invernaderos están fuera del alcance actual; no hay rutas que permitan eliminar al último administrador.

La pertenencia se consulta en PostgreSQL en cada operación; no hay vínculos humanos temporales. El monitoreo revalida permisos durante la conexión. La migración `1792771200009-RolesPorInvernadero` debe aplicarse antes de arrancar esta versión. Conserva asignaciones históricas y traduce sus roles anteriores; no inventa propietarios para invernaderos sin administrador. Esos registros requieren identificar al dueño real y asignarlo expresamente en la base antes de administrarlos. Las nuevas creaciones siempre reciben un administrador.

Las pruebas unitarias comprueban creación transaccional, acceso cruzado y consulta de pertenencias sin caché. Las pruebas HTTP completas de `test/greenhouses.e2e-spec.ts` requieren `AUTH_TEST_DATABASE_URL` y utilizan un esquema desechable.
