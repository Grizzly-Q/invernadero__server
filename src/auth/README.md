# Autenticación

La API utiliza un JWT de acceso para identificar al usuario. Registro e inicio de sesión devuelven el token; las solicitudes protegidas lo envían como Bearer.

Los ESP32 utilizan [credenciales independientes](../controllers/README.md); no se registran como usuarios ni usan sus JWT.

## Endpoints y contrato

| Método | Ruta             | Acceso     | Resultado                     |
| ------ | ---------------- | ---------- | ----------------------------- |
| GET    | `/`              | Público    | Bienvenida                    |
| POST   | `/auth/register` | Público    | Registro y JWT (201)          |
| POST   | `/auth/login`    | Público    | Nueva sesión y JWT (200)      |
| POST   | `/auth/refresh`  | Cookie + Origin | Nuevo acceso y refresh rotado (200) |
| GET    | `/auth/me`       | JWT Bearer | Perfil autenticado (200)      |
| POST   | `/auth/logout`   | Cookie + Origin o Bearer | Revoca la sesión actual (204) |

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
    "email": "ana@example.com"
  }
}
```

El JWT contiene `sub` (usuario), `sid` (sesión), `type`, `iat`, `exp`, `iss` y `aud`, sin contraseñas. Las peticiones protegidas envían:

```http
Authorization: Bearer <accessToken>
```

El servidor guarda la cuenta en `Usuario` y su sesión en `SesionUsuario`, relacionada mediante clave foránea al UUID público. El identificador bigint histórico sigue disponible para las relaciones de negocio. No almacena el JWT de acceso ni tokens recuperables: guarda solamente SHA-256 del refresh, de alta entropía. Ya no necesita `TOKEN_ENCRYPTION_KEY`.

## React y renovación

El acceso dura 15 minutos por defecto y se conserva en una variable o estado en memoria. Registro y login establecen además la cookie `refresh_token` con `HttpOnly`, `Path=/auth`, sin `Domain`, `SameSite=Lax` por defecto y `Secure` obligatorio en producción. JavaScript no lee el refresh. El JSON público conserva el contrato anterior y nunca contiene ese secreto.

```javascript
// Permite que el navegador reciba o envíe la cookie HttpOnly.
const response = await fetch(`${api}/auth/login`, {
  method: 'POST',
  credentials: 'include',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ email, password }),
});
const session = await response.json();
let accessToken = session.accessToken;

// Se usa al recargar la página o cuando vence el acceso; no requiere Bearer.
const renewed = await fetch(`${api}/auth/refresh`, {
  method: 'POST',
  credentials: 'include',
});
if (renewed.ok) accessToken = (await renewed.json()).accessToken;
```

Las consultas protegidas siguen usando `Authorization: Bearer <accessToken>`. Si una falla por acceso vencido, renovar una sola vez y reintentar una sola vez; si la renovación devuelve 401, mostrar login. Coordinar una única renovación en curso, también entre pestañas: canjear simultáneamente la misma cookie provoca detección de reutilización y cierre de esa sesión.

Cada refresh es de uso único. Su canje bloquea la fila PostgreSQL, reemplaza el hash y emite un nuevo acceso y una nueva cookie. Un refresh anterior con firma válida revoca la sesión completa; una cadena arbitraria no la revoca. Los accesos ya emitidos también dejan de autorizar al revocarse la sesión. La sesión vence de forma absoluta a los siete días por defecto: renovar no amplía ese límite. Las demás sesiones del usuario no se cierran.

Refresh y logout mediante cookie requieren un encabezado `Origin` de `WEB_ORIGINS`; el navegador lo añade en estos POST. Login y registro también rechazan orígenes presentes no autorizados. La validación se ejecuta en el servidor y complementa CORS y SameSite. Para cerrar sesión desde React, enviar `POST /auth/logout` con `credentials: 'include'`, sin Bearer: funciona aunque el acceso haya vencido y elimina la cookie. Un refresh inválido también borra la cookie.

Configurar los orígenes exactos en `WEB_ORIGINS`, separados por comas. Con frontend y API en sitios distintos se necesita `COOKIE_SAME_SITE=none` y HTTPS; el navegador puede bloquear cookies de terceros aun con CORS correcto. La configuración del proyecto mantiene React en `http://localhost:5173` y la API en Cloudflare: `.env`, `.env.example` y Wrangler usan `COOKIE_SAME_SITE=none` y `COOKIE_SECURE=true`. Secure protege la conexión HTTPS hacia la API; React puede permanecer en HTTP local. Solo si la API también se ejecuta localmente por HTTP se debe cambiar a `COOKIE_SECURE=false` y `COOKIE_SAME_SITE=lax`.

Errores: **400** para datos inválidos, **401** para credenciales o tokens inválidos/vencidos, **403** para permisos insuficientes, **409** para correo duplicado y **429** al superar límites por IP. NestJS devuelve JSON con `statusCode`, `message` (texto o lista de errores) y `error` cuando corresponde. Login y registro admiten 5 solicitudes por minuto por ruta/IP; el límite general es de 60.

## Android en Java

Enviar JSON mediante Retrofit/OkHttp y agregar `Authorization: Bearer <accessToken>` a las solicitudes protegidas. No se requieren cookies ni CORS para un cliente Android nativo. Cuando el token vence, volver a mostrar el inicio de sesión.

## Alcance actual

Las contraseñas se protegen con scrypt y una sal aleatoria. Cuentas y sesiones se persisten en PostgreSQL y sobreviven reinicios. Los límites de solicitudes siguen en memoria. Antes de usar varias instancias, compartir también los límites de solicitudes y configurar el proxy de confianza. Usar HTTPS para el tráfico real.

Las cuentas no tienen rol global: los permisos se consultan por pertenencia a cada invernadero. El perfil user contiene solo id, name y email. Crear un invernadero asigna ADMIN al creador; ver [invernaderos](../greenhouses/README.md). Las invitaciones internas están pendientes; no se implementan invitaciones por correo. No se incluyen recuperación de contraseña ni verificación de correo. Las pruebas e2e cubren registro, validación, duplicados concurrentes, login, JWT manipulado/vencido, audiencia/emisor, revocación y límites de intentos.

Consultar [autorización y roles](authorization.md) para restringir endpoints y [configuración](../config/README.md) para los valores JWT.

[Volver al README principal](../../README.md).

## Migración y pruebas

Aplicar las migraciones `1792771200008-PersistirCuentasYRefresh` y `1792771200009-RolesPorInvernadero` antes de ejecutar este código. Conserva las sesiones antiguas en SesionUsuarioLegado; es necesario iniciar sesión con el modelo nuevo; las cuentas que solo existían en memoria no pueden recuperarse desde la tabla de sesiones. Los usuarios históricos sin correo se conservan, pero necesitan un correo y una contraseña compatible para iniciar sesión; no se vinculan automáticamente por nombre.

`npm test -- --runInBand` comprueba la lógica. `npm run test:e2e -- --runInBand --testPathPatterns="auth-web|cors"` comprueba cookies, orígenes y CORS sin conexión a PostgreSQL. Para ejecutar también las pruebas completas de registro/login, configurar explícitamente `AUTH_TEST_DATABASE_URL`: crean y eliminan esquemas aleatorios con datos ficticios, nunca utilizan automáticamente `DATABASE_URL`. `npm run migration:test` necesita `MIGRATION_TEST_DATABASE_URL` y verifica también la clave foránea de sesiones y su eliminación en cascada.
