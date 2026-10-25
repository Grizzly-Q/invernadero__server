# Monitoreo bajo demanda

Esta funcionalidad pertenece a `TelemetryModule`. La carpeta `monitoring/` separa internamente los servicios de conexiones y concesiones del almacenamiento histórico; no define un módulo NestJS independiente.

Un sensor puede pasar temporalmente a envío rápido mientras una persona autorizada lo observa. El tráfico normal de `POST /telemetry` continúa cada 30 segundos según el firmware; las muestras rápidas se distribuyen a espectadores y no se insertan en `Medicion`.

## Conexiones

| Cliente | Transporte                        | Destino                                                 | Identidad                                           |
| ------- | --------------------------------- | ------------------------------------------------------- | --------------------------------------------------- |
| ESP32   | WebSocket estándar sobre TLS      | `wss://<api>/controllers/socket`                        | Cabecera `Authorization: Bearer <credencial-esp32>` |
| Android | Socket.IO 4, transporte WebSocket | Namespace `https://<api>/monitoring`, path `/socket.io` | `auth: { token: <JWT-usuario> }`                    |

El ESP32 inicia una conexión saliente y no necesita abrir puertos. Socket.IO y WebSocket estándar no son intercambiables: cada cliente debe usar su protocolo. Las pruebas locales usan HTTP/WS en loopback; producción requiere HTTPS/WSS y verificación de certificados.

## Android

En el proyecto Android añadir el cliente Java 2.x compatible con Socket.IO 4, por ejemplo:

```gradle
implementation ('io.socket:socket.io-client:2.1.1') {
    exclude group: 'org.json', module: 'json'
}
```

Usar los permisos de Internet habituales de Android. Conectar al namespace indicado con el JWT y esperar la conexión antes de emitir `monitoring.start`, solo por acción del usuario. Los callbacks se reciben fuera del hilo principal: actualizar vistas mediante `runOnUiThread`. Cerrar el cliente al salir de la pantalla, por ejemplo en `onStop()`.

El cliente debe renovar concesiones cada 20 segundos y evitar reiniciar sensores automáticamente: después de perder conexión, cerrar la instancia y crear otra con una sesión vigente. Esto evita reenviar órdenes almacenadas de una pantalla anterior. No ejecutar el modo en vivo como un servicio permanente en segundo plano.

### Eventos del usuario

Todos admiten acknowledgement `{ ok: true, data: ... }` o `{ ok: false, error: { status, message } }`.

| Evento             | Cuerpo                                    | Efecto                                                     |
| ------------------ | ----------------------------------------- | ---------------------------------------------------------- |
| `monitoring.start` | `{ "sensorId": "1", "intervalMs": 1000 }` | Solicita un sensor; intervalo opcional de 1000 a 10000 ms. |
| `monitoring.renew` | `{ "sensorId": "1" }`                     | Extiende una suscripción existente por 60 segundos.        |
| `monitoring.stop`  | `{ "sensorId": "1" }`                     | Retira solo la suscripción de esa conexión.                |

`monitoring.state` informa `starting`, `active` o `stopped`. Un inicio aceptado por el servidor todavía puede estar en `starting`: únicamente la confirmación del ESP32 lo convierte en `active`. El intervalo confirmado puede ser mayor al solicitado, por ejemplo 2000 ms para un sensor que no admite 1000 ms. `expiresAt` representa la concesión del espectador; una renovación devuelve su nuevo valor.

Ejemplo de `monitoring.reading`:

```json
{
  "sensorId": "1",
  "controllerId": "1",
  "greenhouseId": "1",
  "type": "HumedadSuelo",
  "unit": "%",
  "requestId": "ea928fd4-9a20-4538-8c76-7c71d248b78a",
  "sequence": 2,
  "readingId": "arranque-unico:125",
  "value": 48.5,
  "measuredAt": "2026-10-23T18:00:00.000Z",
  "receivedAt": "2026-10-23T18:00:00.120Z"
}
```

`measuredAt` puede ser null si el equipo no conoce la hora. Mostrar la antigüedad y la hora de la lectura; una conexión abierta no garantiza que el sensor produzca datos nuevos. El servidor detiene flujos sin lecturas durante más de tres intervalos, con mínimo de cinco segundos.

## Protocolo del ESP32

Después de autenticar, el servidor envía:

```json
{ "type": "monitoring.ready", "leaseSeconds": 60, "normalIntervalMs": 30000 }
```

Una solicitud de inicio o renovación llega así:

```json
{
  "type": "monitoring.start",
  "requestId": "ea928fd4-9a20-4538-8c76-7c71d248b78a",
  "sensorId": "1",
  "intervalMs": 1000,
  "durationSeconds": 60
}
```

El firmware debe confirmar dentro de cinco segundos y declarar su frecuencia real, nunca menor al intervalo solicitado:

```json
{
  "type": "monitoring.ack",
  "requestId": "ea928fd4-9a20-4538-8c76-7c71d248b78a",
  "sensorId": "1",
  "accepted": true,
  "intervalMs": 1000
}
```

Si no reconoce el sensor o no tiene driver, responder `accepted: false`, sin `intervalMs`. Las lecturas rápidas tienen este contrato:

```json
{
  "type": "monitoring.reading",
  "requestId": "ea928fd4-9a20-4538-8c76-7c71d248b78a",
  "sensorId": "1",
  "sequence": 0,
  "readingId": "arranque-unico:126",
  "value": 48.5,
  "measuredAt": "2026-10-23T18:00:01Z"
}
```

`sequence` aumenta dentro de cada orden y se reinicia al cambiar `requestId`. Se descartan órdenes viejas, secuencias repetidas y excesos de frecuencia. `readingId`, valores y fechas respetan las reglas de [telemetría](../README.md). Cada sensor enviado debe pertenecer al ESP32 autenticado.

`monitoring.stop` contiene `requestId` y `sensorId` y exige volver al modo normal. No basta con depender de esa orden: el ESP32 debe expirar localmente toda concesión mediante `millis()` a los 60 segundos, aunque no reciba mensajes o el servidor se apague. Una desconexión limpia también cancela el modo rápido. Las renovaciones usan un nuevo identificador y requieren nueva confirmación.

El código para Arduino IDE se mantiene en el proyecto independiente `esp32__client`, fuera de este servidor. Implementa el protocolo, la caducidad y HTTPS periódico en una tarea separada. Los drivers reales se completan después de definir modelos y pines.

## Espectadores, seguridad y permisos

Todos los espectadores de un sensor comparten una única orden. Se solicita la frecuencia más rápida de los interesados. Salir uno no interrumpe a los demás; salir el último envía stop. Si el ESP32 se desconecta, todas las suscripciones afectadas finalizan; reconectar no las restaura implícitamente.

ADMIN y OPERATOR pueden solicitar sensores de equipos activos conectados únicamente si tienen una pertenencia válida al invernadero del sensor en UsuarioInvernadero. La cuenta se identifica por su UUID persistente en Usuario. No hay acceso administrativo universal ni vínculos temporales en memoria. Las rutas `/monitoring/users/:id/database-identity` fueron retiradas.

La pertenencia se consulta y revalida durante la conexión. Crear un invernadero asigna ADMIN al creador en una transacción; las invitaciones internas siguen fuera del alcance. Consultar [invernaderos](../../greenhouses/README.md).

## Límites y despliegue

- Máximo tres sensores por conexión de usuario, 256 espectadores y 128 equipos por instancia.
- Mensajes de hasta 8 KiB; máximo 20 solicitudes del espectador por diez segundos y diez mensajes del equipo por segundo.
- Handshakes limitados a 60 por minuto/IP y 32 upgrades de equipos pendientes.
- Colas de entrada acotadas y lecturas Socket.IO volátiles: un cliente lento no acumula una cola indefinida de muestras antiguas.
- Pings de transporte cada 20 segundos. Al detectar cierre se retiran concesiones; el plazo local del ESP32 sigue siendo obligatorio.

La implementación comparte memoria dentro de una única instancia. La configuración actual de Cloudflare enruta a `getByName('api')` con `max_instances: 1`; se conserva ese enrutamiento. Antes de escalar, introducir coordinación y distribución entre instancias; no basta con añadir un adaptador de salas Socket.IO.

El proxy debe reenviar upgrades de `/controllers/socket` y `/socket.io/`. El `sleepAfter` actual del contenedor es diez minutos: mantener el tráfico HTTP normal del ESP32, sin asumir que los pings WebSocket renuevan actividad del contenedor. Los reinicios pierden concesiones temporales; conservan cuentas, sesiones y pertenencias; el firmware vuelve al modo normal por su plazo local y los usuarios pueden renovar su acceso y volver a solicitar el monitoreo sin rehacer asociaciones humanas.

No se aplicaron nuevas migraciones ni se activaron equipos reales. Las clases de transporte no sustituyen la autenticación HTTP existente y no reciben actuadores ni órdenes de riego.

## Verificación

```powershell
npm test -- --runInBand
$env:MONITORING_TEST_DATABASE_URL = '<conexion-postgresql-de-pruebas>'
npm run monitoring:test
Remove-Item Env:MONITORING_TEST_DATABASE_URL
```

La prueba crea un esquema aleatorio y utiliza clientes WebSocket y Socket.IO reales. Verifica permisos, flujo compartido, confirmaciones, rotación, bloqueo, logout y que no se insertan lecturas rápidas en el historial; elimina el esquema al finalizar. Las pruebas unitarias usan un reloj controlado para comprobar vencimientos sin esperar un minuto real.

Fuentes de los protocolos: [cliente WebSocket de Espressif](https://docs.espressif.com/projects/esp-protocols/esp_websocket_client/docs/latest/index.html), [middleware Socket.IO](https://socket.io/docs/v4/middlewares), [cliente Java](https://socketio.github.io/socket.io-client-java/initialization.html) y [clase Container](https://developers.cloudflare.com/containers/api/container-class/).
