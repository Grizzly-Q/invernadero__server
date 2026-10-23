# Despliegue con Cloudflare Containers

## Estado y arquitectura

La preparación utiliza Android → HTTPS → Worker → contenedor Node.js/NestJS → PostgreSQL en Supabase.
`wrangler.jsonc` limita la aplicación a una instancia `basic`. El Worker siempre dirige las peticiones a
la instancia lógica `api`, que se suspende tras diez minutos sin actividad. La siguiente petición puede
tardar más por el arranque. Estos ajustes reducen el consumo, pero no representan un límite monetario.

**Despliegue de pruebas:** usuarios y sesiones siguen en memoria y se pierden al reiniciar, suspender
o actualizar. Se acepta esta limitación para las pruebas del equipo sin usuarios reales; la persistencia
queda a cargo del equipo antes del uso real. También se debe revisar TLS en `src/config/db.config.ts`,
actualmente con `rejectUnauthorized: false`, y validar los límites por IP detrás del proxy de Cloudflare.

La API de pruebas está publicada en https://invernadero-api.jair77253.workers.dev.

## 1. Verificar la imagen local

Requisitos: Node.js 24 y Docker Desktop iniciado con contenedores Linux.

```powershell
npm ci
npm run build
npm test -- --runInBand
npm run cloudflare:check
docker info
docker build --platform linux/amd64 -t invernadero-api:local .
docker run --rm --name invernadero-api-local --env-file .env -p 3000:3000 invernadero-api:local
```

Completar primero `.env` a partir de `.env.example`. No se incorpora a la imagen. `GET /` es público y
permite comprobar que NestJS arrancó; el arranque también exige una conexión PostgreSQL accesible.
El comando `docker run --env-file` exige valores sin comillas: a diferencia de `dotenv`, conserva las
comillas literalmente. Si el `.env` utilizado por NestJS tiene valores entre comillas, crear un archivo
local `.env.local` con los valores equivalentes sin comillas y usar `--env-file .env.local` para Docker.
No copiar ese archivo a la imagen ni versionarlo; está excluido de Git y del contexto de construcción.
Probar además registro, login, perfil y logout con los ejemplos de `src/auth/README.md`.
La imagen usa varias etapas, instala solo dependencias de ejecución y ejecuta Node sin privilegios.

## 2. Probar el Worker local

```powershell
Copy-Item .dev.vars.example .dev.vars
npm run cloudflare:dev
```

Antes de ejecutar Wrangler, completar `DATABASE_URL` y `JWT_SECRET` en `.dev.vars` con valores de prueba.
Wrangler usa ese archivo; la ejecución directa con Docker usa `.env`. Ambos quedan fuera de Git y del
contexto de construcción. La URL local habitual de Wrangler es `http://localhost:8787`.

## 3. Configurar la cuenta y realizar un primer despliegue de prueba

Requiere Workers Paid. No ejecutar estos comandos hasta decidir realizar la publicación en la cuenta.
El nombre del Worker en el panel debe ser `invernadero-api`, como en `wrangler.jsonc`.

```powershell
npx wrangler login
npx wrangler secret put DATABASE_URL
npx wrangler secret put JWT_SECRET
npm run cloudflare:deploy
npx wrangler containers list
```

Introducir los secretos en los prompts, nunca en comandos, archivos versionados o argumentos Docker.
Si Wrangler solicita crear el Worker al guardar el primer secreto, aceptar su creación.
`JWT_SECRET` requiere al menos 32 bytes. La URL PostgreSQL debe ser accesible desde el contenedor.
Opcionalmente configurar `ADMIN_EMAIL` y `ADMIN_PASSWORD` como secretos, siempre ambos juntos.
Las opciones públicas de JWT están en `vars`. El Worker pasa explícitamente estas variables al contenedor;
las variables del Worker no se transfieren automáticamente. Cambiar un secreto requiere que el contenedor
arranque nuevamente para recibirlo.

El primer aprovisionamiento puede tardar varios minutos. Comprobar la URL publicada y una petición que
llegue a NestJS. Un despliegue exitoso del Worker no demuestra por sí solo que la imagen haya arrancado.

## 4. Automatizar el despliegue de pruebas desde main

En Cloudflare: Workers & Pages → invernadero-api → Settings → Builds, conectar GitHub o GitLab:

- Directorio raíz: raíz de este repositorio.
- Rama de producción: `main`.
- Comando de construcción: `npm run cloudflare:verify`.
- Comando de despliegue: `npm run cloudflare:deploy`.
- Usar la versión de Node.js indicada en `.node-version`.
- Deshabilitar Preview builds para evitar versiones parciales del Worker sin actualizar la imagen.

La configuración de Cloudflare debe estar integrada en `main` antes de activar la primera construcción.
En GitHub, la aplicación Cloudflare Workers and Pages debe tener acceso a `Grizzly-Q/invernadero__server`.
La integración ya está conectada a ese repositorio y a `main`. Workers Builds utiliza el token dedicado
`invernadero-api Workers Builds`, limitado a esta cuenta, para ejecutar los comandos anteriores cuando
se publique un nuevo commit en la rama de producción. El historial de Builds y el estado del despliegue
se consultan en la pestaña Deployments del Worker.

Workers Builds instala las dependencias; `npm ci` permite reproducirlas desde el lockfile.
La verificación compila NestJS, ejecuta pruebas unitarias y comprueba tipos del Worker.
Las e2e actuales requieren una base de datos y configuración aparte; no deben apuntar a datos reales de
producción. El despliegue construye la imagen Docker, la publica y actualiza el contenedor.

Los secretos de ejecución se configuran en el Worker, no como variables de construcción. No agregar un
workflow paralelo que también publique lo mismo. Los commits locales no disparan nada hasta hacer push.
Para pruebas de otras ramas usar otro Worker con su propia base y secretos: `wrangler versions upload`
no actualiza la imagen del contenedor ni ofrece una vista previa completa de esta aplicación.

## Costos y operación

Revisar consumo de Containers, Workers, Durable Objects, Builds y logs en el panel. La memoria y el disco
se cobran por capacidad reservada mientras el contenedor está activo. Solicitudes frecuentes de sensores
pueden impedir la suspensión. Una segunda instancia o entorno consume cuotas de la misma cuenta.
Las migraciones de base de datos deben planificarse por separado; no ejecutar cambios destructivos al
arrancar cada contenedor. Un rollback de código no revierte el esquema ni los datos de PostgreSQL.

## Verificación local realizada el 23 de octubre de 2026

La imagen `linux/amd64` se construyó y ejecutó con Docker Desktop. Se comprobaron la respuesta HTTP
desde el puerto publicado, la consulta de lectura `GET /db/prueba`, el registro de un usuario temporal
en memoria, login, perfil, rechazo de acceso a `/users` sin rol administrador y revocación por logout.
La imagen no contiene `.env` ni `.dev.vars`, usa el usuario `node` y no instala Nest CLI en ejecución.
El cierre mediante SIGTERM terminó con código 0. Los contenedores temporales se eliminaron al finalizar.
Esta prueba no valida todavía la ejecución en Cloudflare, la persistencia ni el comportamiento bajo carga.

## Referencias oficiales

- https://developers.cloudflare.com/containers/get-started/
- https://developers.cloudflare.com/containers/guides/deploy/
- https://developers.cloudflare.com/containers/examples/env-vars-and-secrets/
- https://developers.cloudflare.com/containers/platform/pricing/
