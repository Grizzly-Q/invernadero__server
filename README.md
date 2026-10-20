# Servidor del invernadero

API NestJS con autenticación JWT para una aplicación Android en Java y autorización básica por roles.

## Preparación

Requiere Node.js 20.19+, 22.12+ o 24+. Instalar dependencias y copiar la configuración:

```powershell
npm install
Copy-Item .env.example .env
node -e "console.log(require('node:crypto').randomBytes(48).toString('hex'))"
```

Completar las dos variables obligatorias de `.env`:

| Variable | Validación |
| --- | --- |
| `DATABASE_URL` | Cadena `postgres://` o `postgresql://` con servidor y nombre de base de datos. Copiarla desde **Connect** en Supabase y completar las credenciales. No usar la URL HTTPS del proyecto. |
| `JWT_SECRET` | Secreto de al menos 32 bytes y no compuesto únicamente por espacios. Usar el valor aleatorio generado anteriormente. |

`ConfigModule` carga `.env` y valida estas variables antes de crear los servicios. La función `validateEnvironment` utiliza `plainToInstance` de `class-transformer` y `validateSync` de `class-validator` con reglas declaradas mediante decoradores. Las variables definidas en el proceso tienen prioridad sobre `.env`. Los errores identifican las variables inválidas sin mostrar credenciales. La validación comprueba el formato, no la conectividad ni los permisos de PostgreSQL.

No compartir ni incorporar estos valores a Android. Las opciones JWT conservan sus valores predeterminados y se rechazan duraciones inválidas. Para crear un administrador inicial, configurar **ambos** `ADMIN_EMAIL` y `ADMIN_PASSWORD` (8 a 128 caracteres). Sin esos valores no se crea ningún administrador. El registro público siempre crea usuarios `USER`.

La configuración se centraliza en `src/config/`: `auth.config.ts` define las opciones JWT, `db.config.ts` construye las opciones de TypeORM y `environment.validation.ts` valida las variables obligatorias. `AppModule` registra estas configuraciones y los módulos consumidores acceden a ellas mediante `ConfigService`.

```powershell
npm run start:dev
```

Por defecto escucha en el puerto 3000. El único JWT dura 900 segundos (15 minutos); `JWT_ACCESS_TTL_SECONDS` permite cambiar esta duración. Al vencer, el usuario debe iniciar sesión otra vez.

## Endpoints

| Método | Ruta | Acceso | Resultado |
| --- | --- | --- | --- |
| GET | `/` | Público | Bienvenida |
| POST | `/auth/register` | Público | Registro y JWT (201) |
| POST | `/auth/login` | Público | Nueva sesión y JWT (200) |
| GET | `/auth/me` | JWT Bearer | Perfil autenticado (200) |
| POST | `/auth/logout` | JWT Bearer | Revoca la sesión actual (204) |
| GET | `/users` | JWT Bearer y rol ADMIN | Perfiles sin credenciales (200) |

Registro:

```json
{
  "name": "Ana",
  "email": "ana@example.com",
  "password": "Una-clave-segura-123"
}
```

Login recibe `email` y `password`. Se normaliza el correo, pero nunca se recorta ni modifica la contraseña. Se rechazan campos adicionales, incluido `role`, con 400. Las contraseñas deben tener entre 8 y 128 caracteres.

Registro y login devuelven un único JWT con este contrato:

```json
{
  "accessToken": "<JWT firmado>",
  "tokenType": "Bearer",
  "expiresIn": 900,
  "user": {
    "id": "<UUID>",
    "name": "Ana",
    "email": "ana@example.com",
    "role": "USER"
  }
}
```

El JWT contiene `sub` (usuario), `sid` (sesión), `type`, `iat`, `exp`, `iss` y `aud`, sin contraseñas. Las peticiones protegidas envían:

```http
Authorization: Bearer <accessToken>
```

Cuando el JWT vence, la API devuelve 401 y Android debe volver a mostrar login. El logout revoca inmediatamente el JWT de la sesión actual; otras sesiones del usuario siguen abiertas.

Errores: **400** para datos inválidos, **401** para credenciales o tokens inválidos/vencidos, **403** para permisos insuficientes, **409** para correo duplicado y **429** al superar límites por IP. NestJS devuelve JSON con `statusCode`, `message` (texto o lista de errores) y `error` cuando corresponde. Login y registro admiten 5 solicitudes por minuto por ruta/IP; el límite general es de 60.

## Decoradores de autorización

Todas las rutas nuevas requieren JWT por defecto. `@Public()` permite rutas públicas, `@Roles(...)` exige cualquiera de los roles indicados y `@CurrentUser()` inyecta el perfil que verificó el servidor.

```typescript
import { Controller, Get } from '@nestjs/common';
import { CurrentUser } from './auth/decorators/current-user.decorator';
import { Roles } from './auth/decorators/roles.decorator';
import { Role } from './users/role.enum';
import type { PublicUser } from './users/user.types';

/** Ejemplo de un recurso que admite los dos roles existentes. */
@Controller('invernaderos')
export class InvernaderosController {
  /** Devuelve la identidad verificada para una operación autorizada. */
  @Get('perfil')
  @Roles(Role.ADMIN, Role.USER)
  perfil(@CurrentUser() user: PublicUser): PublicUser {
    return user;
  }
}
```

Registrar cualquier controlador nuevo en su módulo. `@Roles` puede usarse en clases o métodos; la declaración del método reemplaza la de la clase. No combinar `@Public()` y `@Roles()` en la misma ruta: las rutas con roles deben autenticarse. El servidor consulta el rol actual del usuario, sin aceptar roles enviados por Android. El ejemplo real de autorización ADMIN se encuentra en `src/users/users.controller.ts`.

## Android en Java

Consultar [la guía y los ejemplos de Retrofit/OkHttp](docs/android-auth.md). La API utiliza JSON y Bearer; no requiere cookies ni CORS para un cliente Android nativo.

## Verificación

```powershell
npm run build
npm run lint
npm test -- --runInBand
npm run test:e2e -- --runInBand
```

Las pruebas unitarias incluyen la validación del entorno y su integración con `ConfigModule`; utilizan credenciales ficticias y no requieren `.env` ni conexión a PostgreSQL. Las pruebas e2e actuales cargan `AppModule` completo, por lo que requieren `DATABASE_URL`, un `JWT_SECRET` válido y una base accesible. Cubren registro, validación, duplicados concurrentes, login, JWT manipulado/vencido, audiencia/emisor, roles, revocación y límites de intentos.

## Persistencia y alcance de esta base

**Usuarios, sesiones y límites de solicitudes se almacenan en memoria y se pierden al reiniciar.** Esta base sirve para desarrollo en un único proceso. Antes de un despliegue real, sustituir el almacén de `UsersService` por una base de datos con correo único y persistir las sesiones (identificador, usuario y vencimiento) para conservar la revocación entre reinicios. Para múltiples instancias, compartir también el almacén de límites de solicitudes y configurar correctamente el proxy de confianza.

Las contraseñas se protegen con scrypt y sal aleatoria. Usar HTTPS para el tráfico real. No se incluyen recuperación de contraseña, verificación de correo ni administración de roles desde la API.

Referencias del framework: [autenticación](https://docs.nestjs.com/security/authentication), [autorización](https://docs.nestjs.com/security/authorization) y [validación](https://docs.nestjs.com/techniques/validation).
