# Controladores ESP32

`ControllersModule` administra controladores ESP32, sensores y credenciales persistentes con TypeORM. Los ESP32 no son usuarios ni tienen roles humanos.

## Autenticación

La administración exige JWT con rol `ADMIN`. Cada ESP32 usa una clave `esp32_<43 caracteres Base64URL>`, generada con 32 bytes aleatorios criptográficos, enviada mediante HTTPS en `Authorization: Bearer <credencial>`.

La clave original aparece únicamente al emitirla. PostgreSQL guarda su SHA-256 hexadecimal; los repositorios no seleccionan ese campo por defecto y las respuestas nunca lo exponen. Se utiliza `Cache-Control: no-store`. No registrar claves ni encabezados Authorization en logs.

`AuthenticationGuard` exige JWT por defecto. `@DeviceOnly()` exige una credencial de controlador ESP32, sin hacer pública la ruta. No combinarlo con `@Public()` ni con roles humanos: esa configuración se rechaza. Los JWT humanos no sirven en rutas de controladores ESP32, ni sus claves dan acceso a rutas de personas.

## Endpoints

Todas las rutas de esta tabla requieren JWT de administrador:

| Método | Ruta                                         | Resultado                                                                   |
| ------ | -------------------------------------------- | --------------------------------------------------------------------------- |
| POST   | `/controllers`                               | Registra un controlador ESP32 desactivado; 201.                             |
| GET    | `/controllers`                               | Lista hasta 50 controladores ESP32.                                         |
| PATCH  | `/controllers/:id`                           | Activa o bloquea un controlador ESP32.                                      |
| POST   | `/controllers/:id/credentials`               | Emite una clave adicional; 201.                                             |
| POST   | `/controllers/:id/credentials/rotate`        | Revoca todas las anteriores y emite otra atómicamente; 201.                 |
| GET    | `/controllers/:id/credentials`               | Lista metadatos de claves, sin hashes.                                      |
| DELETE | `/controllers/:id/credentials/:credentialId` | Revoca una clave del controlador ESP32; 204, también si ya estaba revocada. |
| GET    | `/controllers/:id/sensors`                   | Lista los sensores para configurar el firmware.                             |
| POST   | `/controllers/:id/sensors`                   | Registra un sensor de tipo permitido; 201.                                  |

Las listas de controladores ESP32 y credenciales aceptan `?beforeId=<id>` y devuelven `{ items, nextBeforeId }`, con un máximo de 50 registros. Los identificadores bigint se envían como cadenas decimales positivas, máximo `9223372036854775807`.

`GET /controllers/me` exige exclusivamente la clave del ESP32, devuelve su perfil y actualiza su última comunicación.

Para órdenes de muestreo rápido existe además `wss://<api>/controllers/socket`, con la misma credencial individual en cabecera. Su autorización se revalida durante la conexión; consultar [monitoreo en vivo](../telemetry/monitoring/README.md).

## Aprovisionamiento

1. Iniciar sesión como administrador en `/auth/login`.
2. Consultar `/controllers` para usar un controlador ESP32 existente o registrar uno en un invernadero existente:

```json
{ "greenhouseId": "1", "name": "ESP32 del invernadero principal" }
```

3. Consultar sus sensores. Para registrar uno, enviar a `/controllers/<id>/sensors`:

```json
{ "type": "HumedadSuelo", "unit": "%" }
```

4. Emitir una clave con `POST /controllers/<id>/credentials` y `{}`. Opcionalmente enviar `expiresAt` como fecha futura ISO 8601 con zona explícita; omitirlo o usar null significa sin vencimiento.

Respuesta ilustrativa; el marcador no es una clave válida:

```json
{
  "id": "1",
  "controllerId": "1",
  "credential": "<clave-entregada-solo-en-esta-respuesta>",
  "tokenType": "Bearer",
  "createdAt": "2026-10-23T18:00:00.000Z",
  "expiresAt": null
}
```

5. Guardar la clave en el ESP32. Si se pierde, emitir otra: no puede recuperarse.
6. Activar con `PATCH /controllers/<id>` y `{ "active": true }`. Se exige alguna clave vigente. Comprobar `/controllers/me` con la clave del controlador ESP32 y enviar [telemetría](../telemetry/README.md).

## Revocación y concurrencia

Bloquear con `active: false` impide usar todas las claves sin revocarlas. Reactivarlo permite usar las que sigan vigentes. Vencimiento y revocación invalidan claves incluso de controladores ESP32 activos.

Para reemplazo inmediato, usar `/credentials/rotate`. Para transición coordinada, emitir una clave adicional, instalarla en el ESP32 y revocar individualmente las anteriores.

La recepción de lecturas y los cambios administrativos bloquean la misma fila del controlador ESP32. La recepción revalida autorización, revocación y vencimiento dentro de su transacción; una identidad obtenida antes de revocar no basta para escribir después.

Errores: 400 para formatos o fechas inválidas; 401 para claves inválidas, vencidas o revocadas y controladores ESP32 bloqueados; 403 para roles insuficientes; 404 para controladores ESP32 o credenciales inexistentes; 409 para invernaderos con controlador ESP32 o tipos de sensor duplicados.

## Conectividad y alcance

La comunicación válida actualiza `ultimaComunicacionEn_Controlador` y marca `Conectado`. Desactivar marca `Desconectado`. Aún no se detecta inactividad automáticamente: consultar la fecha de última comunicación para conocer cuándo contactó el controlador ESP32.

Se mantienen un ESP32 por invernadero y un sensor por tipo/controlador ESP32. Los tipos son `HumedadAmbiental`, `HumedadSuelo` y `NivelAgua`. No se activan controladores ESP32 reales ni se generan claves al arrancar la API.

Las cuentas y sesiones humanas se guardan en PostgreSQL. Configurar el administrador inicial según la [guía de configuración](../config/README.md). Los límites por IP y controlador ESP32 viven en memoria y se reinician con el proceso.

## Pruebas

```powershell
$env:CONTROLLER_TEST_DATABASE_URL = '<conexion-postgresql-de-pruebas>'
npm run controllers:test
Remove-Item Env:CONTROLLER_TEST_DATABASE_URL
```

La prueba HTTP crea un esquema aleatorio con datos ficticios y lo elimina al terminar. Requiere permisos de creación de esquemas y DDL; no modifica tablas de negocio existentes ni imprime claves.

[Migraciones](../db/migrations/README.md) · [Autenticación](../auth/README.md) · [Telemetría](../telemetry/README.md).
