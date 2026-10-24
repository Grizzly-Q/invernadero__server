# Historial de cambios de PostgreSQL

Las migraciones son la única vía prevista para cambiar el esquema. Nest y la CLI comparten [database-options.ts](../database-options.ts), con `synchronize: false`, `migrationsRun: false` y transacción `all`. Iniciar la API no modifica tablas.

## Punto de partida

[esquema-inicial.json](../baseline/esquema-inicial.json) documenta columnas, restricciones, índices y RLS consultados el 23 de octubre de 2026. No contiene registros, secretos ni una copia de seguridad restaurable.

La primera migración reconoce una base existente; no crea nuevamente las tablas del proyecto. Para una base vacía, primero se debe restaurar su esquema inicial desde un respaldo. No usar `--fake` para omitir cambios pendientes.

| Orden | Migración                                 | Efecto                                                                                          |
| ----- | ----------------------------------------- | ----------------------------------------------------------------------------------------------- |
| 1     | `ReconocerEsquemaInicial1792771200000`    | Verifica el esquema previo y protege el historial técnico con RLS.                              |
| 2     | `AmpliarControlador1792771200001`         | Añade nombre, autorización y fechas administrativas.                                            |
| 3     | `CrearCredencialControlador1792771200002` | Crea credenciales con hashes únicos, fechas y RLS.                                              |
| 4     | `AdaptarMedicion1792771200003`            | Añade identidad propia y deduplicación; separa medición y recepción.                            |
| 5     | `NormalizarFechasPorDefecto1792771200004` | Alinea los valores por defecto con la representación equivalente `now()` utilizada por TypeORM. |

TypeORM registra cada ejecución en `public.typeorm_migrations`. Sus columnas internas `id`, `timestamp` y `name` son administradas por TypeORM y constituyen la excepción técnica a `campo_Tabla`. `timestamp` identifica la versión de la migración; no registra su hora real de ejecución.

## Nombres y compatibilidad

Todas las columnas nuevas de negocio siguen `campo_Tabla`. Las propiedades TypeScript se vinculan con nombres explícitos en los decoradores; los bigint y numeric se representan como cadenas para no perder precisión.

Se conservan las columnas antiguas y sus relaciones, salvo `Medicion.fechaHora`, que se convierte y renombra a `medidoEn_Medicion`. También se sustituye su clave primaria compuesta por `idMedicion_Medicion`. Las consultas antiguas que utilicen `fechaHora` deben actualizarse.

Se mantiene un controlador por invernadero y un sensor de cada tipo por controlador. Los tipos actuales son `HumedadAmbiental`, `HumedadSuelo` y `NivelAgua`; no se incorpora temperatura en estos cambios.

## Conservación de datos

- Las fechas existentes de medición se interpretan como `America/Lima`, confirmado por el responsable del proyecto. Se convierten con `AT TIME ZONE 'America/Lima'`, sin depender de la zona de la sesión PostgreSQL.
- Los valores numéricos y sensores asociados no se modifican.
- Las lecturas anteriores reciben `idLectura_Medicion = historica:<idMedicion>` y conservan `recibidoEn_Medicion = NULL`: no se conoce su recepción original.
- Los controladores existentes reciben el nombre `ESP32 <id>` y permanecen desactivados hasta aprovisionar sus credenciales. Sus fechas de creación y última comunicación quedan nulas porque no se conocen.
- Las inserciones nuevas tienen fecha de creación o recepción por defecto. `medidoEn_Medicion` puede ser nulo si el equipo no sincronizó su reloj. La futura API debe impedir que el cliente establezca la hora de recepción.
- La restricción única `(idSensor_Medicion, idLectura_Medicion)` evita duplicados por reintento. El firmware debe conservar el mismo identificador al reenviar y evitar reutilizarlo después de reiniciar.

## Ejecutar en desarrollo

La CLI requiere `DATABASE_URL` en el entorno o en `.env`, y no necesita `JWT_SECRET`. El proceso tiene prioridad sobre `.env`; no se carga `.dev.vars` para evitar seleccionar accidentalmente otro destino.

```powershell
npm run migration:show
npm run migration:run
```

`migration:show` puede crear la tabla técnica del historial si no existe. `migration:run` aplica las pendientes en una sola transacción. Ejecutar con una sola instancia de la CLI y realizar un respaldo antes de modificar una base con datos.

Para producción, compilar primero o usar la imagen Docker que ya contiene `dist`:

```powershell
npm run build
npm run migration:show:prod
npm run migration:run:prod
```

Ejecutar las migraciones como paso explícito del despliegue, antes de activar código que dependa del nuevo esquema. La cuenta debe tener permisos DDL y acceso a las tablas protegidas por RLS. No exponer la conexión PostgreSQL al ESP32.

## Prueba de integración

```powershell
$env:MIGRATION_TEST_DATABASE_URL = '<conexion-postgresql-de-pruebas>'
npm run migration:test
Remove-Item Env:MIGRATION_TEST_DATABASE_URL
```

La prueba exige una conexión explícita y permiso para crear esquemas. Recrea la referencia inicial con datos ficticios en un esquema aleatorio, aplica las migraciones, valida restricciones, fechas y repositorios, prueba las reversiones y vuelve a aplicarlas. Todo ocurre en una transacción que se revierte al terminar, sin cambiar tablas de negocio existentes.

## Nuevos cambios

```powershell
npm run migration:create -- src/db/migrations/DescribirCambio
```

Completar `up()` y `down()` con comentarios en español, actualizar las entidades y revisar el SQL. Las migraciones aplicadas son inmutables: añadir un archivo nuevo para cambios posteriores y versionarlo en Git junto con sus entidades.

No se ofrece generación automática en estos scripts: el modelo TypeORM aún cubre solo invernaderos, controladores, credenciales, sensores y mediciones. No debe interpretarse como un modelo completo de toda la base ni generarse SQL sin revisión.

## Revertir

```powershell
npm run migration:revert
# Con código compilado:
npm run migration:revert:prod
```

Cada ejecución revierte únicamente la última migración. Revertir `AdaptarMedicion` restaura las horas locales de Perú, pero elimina los identificadores nuevos y las fechas de recepción. Se rechaza la reversión si existen horas de medición nulas o sensor/hora repetidos, porque no caben en la clave antigua; nunca se eliminan lecturas para forzarla.

Revertir credenciales elimina sus registros y exige aprovisionarlos otra vez. Revertir la ampliación de controladores pierde sus campos nuevos. El marcador inicial no elimina las tablas previas ni desprotege el historial. Una reversión no sustituye un respaldo.

## Seguridad y alcance

Las tablas nuevas de credenciales y del historial tienen RLS activado y carecen de permisos de tabla para `PUBLIC`, `anon` y `authenticated`. El acceso previsto es desde el backend con una cuenta PostgreSQL autorizada; si esa cuenta no es propietaria ni tiene bypass de RLS, se deben definir permisos y políticas específicos antes de utilizarla.

El esquema admite hashes SHA-256 hexadecimales de claves aleatorias de alta entropía, revocación, vencimiento y varias credenciales por equipo para permitir rotación. No se generan claves durante estas migraciones.

Los endpoints de aprovisionamiento, verificación de credenciales y recepción de telemetría se documentan en [controllers](../../controllers/README.md) y [telemetría](../../telemetry/README.md). La autenticación de usuarios y sus sesiones sigue en memoria.
