# Autenticación

La API utiliza un JWT de acceso para identificar al usuario. Registro e inicio de sesión devuelven el token; las solicitudes protegidas lo envían como Bearer.

## Endpoints y contrato

| Método | Ruta | Acceso | Resultado |
| --- | --- | --- | --- |
| GET | `/` | Público | Bienvenida |
| POST | `/auth/register` | Público | Registro y JWT (201) |
| POST | `/auth/login` | Público | Nueva sesión y JWT (200) |
| GET | `/auth/me` | JWT Bearer | Perfil autenticado (200) |
| POST | `/auth/logout` | JWT Bearer | Revoca la sesión actual (204) |

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
    "role": "OPERATOR"
  }
}
```

El JWT contiene `sub` (usuario), `sid` (sesión), `type`, `iat`, `exp`, `iss` y `aud`, sin contraseñas. Las peticiones protegidas envían:

```http
Authorization: Bearer <accessToken>
```

Cuando el JWT vence, la API devuelve 401 y Android debe volver a mostrar login. El logout revoca inmediatamente el JWT de la sesión actual; otras sesiones del usuario siguen abiertas.

Errores: **400** para datos inválidos, **401** para credenciales o tokens inválidos/vencidos, **403** para permisos insuficientes, **409** para correo duplicado y **429** al superar límites por IP. NestJS devuelve JSON con `statusCode`, `message` (texto o lista de errores) y `error` cuando corresponde. Login y registro admiten 5 solicitudes por minuto por ruta/IP; el límite general es de 60.

## Android en Java

Enviar JSON mediante Retrofit/OkHttp y agregar `Authorization: Bearer <accessToken>` a las solicitudes protegidas. No se requieren cookies ni CORS para un cliente Android nativo. Cuando el token vence, volver a mostrar el inicio de sesión.

## Alcance actual

Las contraseñas se protegen con scrypt y una sal aleatoria. Las sesiones y los límites de solicitudes están en memoria: el reinicio pierde las sesiones y reinicia los contadores. Antes de usar varias instancias, compartir la persistencia de sesiones y límites y configurar el proxy de confianza. Usar HTTPS para el tráfico real.

No se incluyen recuperación de contraseña ni verificación de correo. Las pruebas e2e cubren registro, validación, duplicados concurrentes, login, JWT manipulado/vencido, audiencia/emisor, revocación y límites de intentos.

Consultar [autorización y roles](authorization.md) para restringir endpoints y [configuración](../config/README.md) para los valores JWT.

[Volver al README principal](../../README.md).
