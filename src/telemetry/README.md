# Telemetría

`TelemetryModule` agrupa la recepción y almacenamiento de mediciones en PostgreSQL mediante TypeORM y el monitoreo en vivo. Los servicios y transportes de monitoreo están en `monitoring/`, dentro de este módulo. `POST /telemetry` exige una credencial vigente de un ESP32 activo; los JWT de personas no permiten enviar lecturas.

## Solicitud del ESP32

Usar HTTPS, `Authorization: Bearer <credencial-del-equipo>` y `Content-Type: application/json`:

```json
{
  "readings": [
    {
      "sensorId": "1",
      "readingId": "arranque-unico-7:125",
      "measuredAt": "2026-10-23T10:30:00-05:00",
      "value": 48.5
    },
    {
      "sensorId": "2",
      "readingId": "arranque-unico-7:125",
      "value": 71.2
    }
  ]
}
```

Los identificadores de sensores se obtienen administrando [controllers](../controllers/README.md). No se envía identificador de controlador: se obtiene de la credencial.

Cada lote admite de 1 a 100 lecturas y se procesa en una transacción. Todos los sensores deben pertenecer al equipo autenticado. Se rechazan campos desconocidos, también dentro de cada lectura.

| Campo        | Regla                                                                                                                                         |
| ------------ | --------------------------------------------------------------------------------------------------------------------------------------------- |
| `sensorId`   | Cadena decimal positiva dentro del rango bigint de PostgreSQL.                                                                                |
| `readingId`  | De 1 a 100 caracteres alfanuméricos, guiones, guiones bajos o dos puntos; empieza por letra o número. El prefijo `historica:` está reservado. |
| `measuredAt` | Opcional o null sin reloj sincronizado. ISO 8601 con hora y zona explícita; máximo cinco minutos en el futuro.                                |
| `value`      | Número finito no negativo, máximo dos decimales y `99999.99`. Humedades y sensores con unidad `%` tienen máximo 100.                          |

No inventar fechas cuando el ESP32 no tenga reloj sincronizado. Android puede mostrar el instante en hora de Perú.

## Reintentos

`readingId` identifica una lectura por sensor y debe conservarse durante cada reintento. Puede compartirse entre sensores diferentes del mismo muestreo. No reutilizarlo tras reiniciar: usar, por ejemplo, un identificador único de arranque más un contador.

- Una lectura nueva se inserta.
- El mismo sensor, identificador, valor y hora se reconoce sin duplicar ni cambiar su recepción original.
- Reutilizar sensor e identificador con otro valor u hora produce 409 y revierte todo el lote.
- Repetir sensor e identificador dentro del mismo lote produce 400.

Respuesta 200 para lecturas nuevas y reintentos:

```json
{ "controllerId": "1", "received": 2, "inserted": 2, "duplicates": 0 }
```

401 indica un problema con clave, vencimiento o activación; 403 indica sensores ajenos; 400 indica contrato inválido; 409 indica reutilización de identificadores. Para fallos temporales o 429, reintentar con esperas crecientes, conservando identificadores y contenido originales.

## Persistencia y fechas

| Propiedad    | Columna PostgreSQL   |
| ------------ | -------------------- |
| `sensorId`   | `idSensor_Medicion`  |
| `readingId`  | `idLectura_Medicion` |
| `measuredAt` | `medidoEn_Medicion`  |
| `value`      | `valor`              |

`idMedicion_Medicion` se genera automáticamente. `recibidoEn_Medicion` utiliza la fecha del servidor y no se acepta en el JSON. Las lecturas históricas conservan recepción null porque nunca se registró; las nuevas reciben el valor por defecto. Numeric y bigint se leen como cadenas en TypeORM para conservar precisión.

La recepción revalida la credencial bajo bloqueo del equipo, serializa envíos simultáneos y actualiza última comunicación y estados de sensores. Un lote rechazado no actualiza estados ni inserta lecturas parcialmente.

## Límites y alcance

Se aplican 60 solicitudes por minuto y ruta/IP, más 60 por minuto y ruta/equipo autenticado. Los contadores viven en memoria. El esquema admite `HumedadAmbiental`, `HumedadSuelo` y `NivelAgua`, un sensor por tipo/equipo.

No se incluyen alertas automáticas ni control de actuadores. El firmware físico debe configurarse con URL HTTPS, su credencial y los identificadores de sensores.

## Historial por sensor

`GET /telemetry/sensors/:sensorId/history` requiere JWT humano. ADMIN puede consultar cualquier sensor; OPERATOR necesita el mismo vínculo de identidad PostgreSQL y asignación a invernadero que el [monitoreo](monitoring/README.md). Una credencial de ESP32 no permite consultar reportes. No es necesario que el controlador esté conectado o activo para consultar su historial.

```http
GET /telemetry/sensors/1/history?period=day
Authorization: Bearer <JWT-usuario>
```

- `period=day` (predeterminado): últimas 24 horas; `period=week`: últimos siete días. Son ventanas móviles, no días del calendario.
- Alternativamente, enviar `from` y `to` juntos, en ISO 8601 con zona horaria, sin `period`. Máximo 31 días. El inicio se incluye y el final se excluye.
- `groupBy=none` (predeterminado): lecturas individuales; `groupBy=hour`: promedio, mínimo, máximo y cantidad por hora UTC. Las horas sin lecturas se omiten, no se rellenan con ceros.
- `page`: desde 1 hasta 10000, predeterminado 1. `limit`: de 1 a 500, predeterminado 100. El orden es cronológico ascendente. Las páginas de ventanas móviles pueden variar mientras llegan lecturas; usar `from` y `to` fijos al recorrer un periodo.

Ejemplo para una gráfica semanal: `/telemetry/sensors/1/history?period=week&groupBy=hour&limit=200`.

Para un día calendario de Perú, usar límites explícitos, por ejemplo `from=2026-10-22T00:00:00-05:00` y `to=2026-10-23T00:00:00-05:00`, codificados como parámetros de URL.

La respuesta incluye `sensor` (id, controllerId, type, unit), `range` (from, to), `groupBy`, `summary` (count, minimum, maximum, average), `pagination` (page, limit, total, hasNext) e `items`. Las estadísticas abarcan todo el periodo; `pagination.total` cuenta lecturas o grupos según `groupBy`. Los conteos se devuelven como cadenas para conservar precisión; los valores y estadísticas son números.

Las muestras individuales contienen `id`, `readingId`, `value`, `measuredAt`, `receivedAt` y `timestamp`. Los grupos contienen `bucketStart`, `count`, `minimum`, `maximum` y `average`. `timestamp` utiliza la fecha medida o, si falta, la de recepción. Las fechas se devuelven en UTC. Una fila sin ninguna fecha no puede ubicarse en un periodo y se excluye. Un periodo vacío devuelve conteo `"0"`, estadísticas null y `items: []`.

Errores: 400 para filtros inválidos, 401 sin JWT válido, 403 sin acceso al invernadero y 404 para sensor inexistente. Esta consulta devuelve JSON para reportes o gráficas; no genera PDF ni incluye las muestras rápidas que no se guardaron en `Medicion`.

El [modo en vivo](monitoring/README.md) utiliza un canal separado con concesiones temporales. Sus lecturas rápidas se comparten con espectadores autorizados sin insertar cada muestra en el historial; el POST periódico de esta guía sigue disponible.

[Aprovisionamiento](../controllers/README.md) · [Migraciones](../db/migrations/README.md).
