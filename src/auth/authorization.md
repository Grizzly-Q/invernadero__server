# Autorización, roles y permisos

La autenticación comprueba quién es el usuario. La autorización decide si puede acceder a un endpoint. `AuthenticationGuard` y `RolesGuard` están registrados globalmente en `AuthModule`: no necesitas repetir `@UseGuards` en cada ruta.

El guard global exige JWT de usuario por defecto. `@DeviceOnly()` selecciona una credencial ESP32 y guarda su identidad en `request.controller`. No combinarlo con `@Public()` ni con roles humanos. La administración exige `ADMIN` y la telemetría exige identidad de equipo. Consultar [controllers](../controllers/README.md).

Los transportes persistentes no pasan por los guards HTTP: el monitoreo de [telemetry](../telemetry/monitoring/README.md) verifica explícitamente JWT, credenciales y asignaciones, y los revalida durante la conexión. Los Operadores necesitan un vínculo administrativo con su Usuario PostgreSQL y una asignación válida en `UsuarioInvernadero`; nunca se les concede acceso a todos los invernaderos por tener un JWT.

## Roles disponibles

Cada usuario humano tiene un único rol asignado por el servidor. Los ESP32 pertenecen al módulo `controllers` y no tienen un rol de usuario:

| Nombre        | Constante       | Valor en JSON |
| ------------- | --------------- | ------------- |
| Administrador | `Role.ADMIN`    | `ADMIN`       |
| Operador      | `Role.OPERATOR` | `OPERATOR`    |

El registro público asigna `OPERATOR` y rechaza el campo `role`. No hay jerarquía automática: el Administrador también debe estar incluido en la lista de roles permitidos.

## Permitir un solo rol

Coloca uno de estos decoradores sobre el método del controlador:

```typescript
@Roles(Role.ADMIN)
@Roles(Role.OPERATOR)
```

Las líneas anteriores son alternativas: usa una sola por método. Ejemplo de un controlador ubicado en `src/invernaderos/`:

```typescript
import { Controller, Get } from '@nestjs/common';
import { Roles } from '../auth/decorators/roles.decorator';
import { Role } from '../users/role.enum';

/** Ejemplo de endpoints con acceso individual y compartido. */
@Controller('invernaderos')
export class InvernaderosController {
  /** Permite únicamente al Administrador. */
  @Get('administracion')
  @Roles(Role.ADMIN)
  administracion() {
    return { message: 'Acceso de Administrador' };
  }

  /** Permite a un Administrador o a un Operador. */
  @Get('monitoreo')
  @Roles(Role.ADMIN, Role.OPERATOR)
  monitoreo() {
    return { message: 'Acceso de Administrador o Operador' };
  }
}
```

Registrar el controlador en su módulo para habilitar sus rutas. Estos ejemplos explican la sintaxis; no definen los permisos definitivos del negocio.

## Permitir ambos roles

Usa un solo decorador con todos los roles admitidos:

```typescript
@Roles(Role.ADMIN, Role.OPERATOR)
```

Significa Administrador **o** Operador; no exige ambos roles.

No apiles varios `@Roles` sobre el mismo método: no acumulan sus listas.

## Reglas importantes

- Sin `@Roles`, basta con un JWT válido, salvo que el controlador tenga una restricción.
- `@Roles` sobre la clase protege todos sus métodos. La lista de un método reemplaza la de la clase.
- `@Roles()` en un método elimina la restricción heredada y mantiene la autenticación.
- `@Public()` permite acceso sin JWT. No lo combines con `@Roles` en la misma ruta.
- `@CurrentUser()` permite obtener el perfil verificado en el controlador.
- Sin JWT válido se devuelve **401**; con un rol insuficiente se devuelve **403**.

El guard utiliza el rol actual obtenido por el servidor, no un rol enviado por Android. El ejemplo real de una ruta exclusiva del Administrador está en [users.controller.ts](../users/users.controller.ts).

## Asignación y límites

El servidor puede asignar un rol con `UsersService.create(nombre, correo, contraseña, Role.ADMIN)`; para crear el Administrador inicial se usan las variables descritas en la [configuración](../config/README.md). Todavía no hay un endpoint para cambiar roles.

Actualmente los permisos se expresan mediante listas de roles por endpoint. No existe un catálogo de permisos individuales ni políticas de PostgreSQL/Supabase generadas por estos roles. Los usuarios y sus roles siguen almacenados en memoria.

Las pruebas de `roles.guard.spec.ts` comprueban rutas individuales, compartidas, herencia y ausencia de privilegios implícitos.

[Autenticación](README.md) · [Usuarios](../users/README.md) · [Volver al README principal](../../README.md).
