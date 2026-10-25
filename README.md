# Servidor del invernadero

API NestJS para una aplicación Android en Java, con PostgreSQL alojado en Supabase.

## Inicio rápido

Requiere Node.js 20.19+, 22.12+ o 24+.

```powershell
npm install
Copy-Item .env.example .env
npm run start:dev
```

Antes de arrancar, completar `DATABASE_URL` y `JWT_SECRET` en `.env`. Consultar la [guía de configuración](src/config/README.md). Por defecto, la API escucha en `http://localhost:3000`.
Antes de arrancar, completar `DATABASE_URL`, `JWT_SECRET` y `TOKEN_ENCRYPTION_KEY` en `.env`. Consultar la [guía de configuración](src/config/README.md). Por defecto, la API escucha en `http://localhost:3000`.

El middleware CORS permite el proyecto React servido desde `http://localhost:5173`, incluidos los encabezados `Authorization` y `Content-Type`. El frontend debe enviar el JWT como Bearer; no se usan cookies ni `credentials: 'include'`. Este permiso de navegador no reemplaza la autenticación ni los permisos de cada endpoint. Otros orígenes, como `http://127.0.0.1:5173`, no están incluidos.

## Documentación por módulo

- [Configuración y variables de entorno](src/config/README.md).
- [Autenticación y uso desde Android](src/auth/README.md).
- [Autorización](src/auth/authorization.md).
- [Usuarios](src/users/README.md).
- [Controladores ESP32](src/controllers/README.md).
- [Telemetría](src/telemetry/README.md).
- [Monitoreo en vivo y protocolo ESP32/Android](src/telemetry/monitoring/README.md).
- [Base de datos](src/db/README.md).
- [Migraciones e historial de cambios](src/db/migrations/README.md).

## Verificación

```powershell
npm run build
npm run lint
npm test -- --runInBand
npm run test:e2e -- --runInBand
```

Las pruebas unitarias no necesitan una base de datos. Las pruebas e2e requieren la configuración de entorno y una base accesible. Su runner usa soporte VM para ESM de Nest TypeORM y resolución de imports relativos `.js` a TypeScript; utilizar Node.js 24.9+ para estas pruebas.

La prueba HTTP de ESP32 y la prueba de migraciones utilizan esquemas aislados con conexiones explícitas. Consultar [controllers](src/controllers/README.md) y [migraciones](src/db/migrations/README.md) para ejecutarlas.

## Alcance actual

Los controladores ESP32, sus credenciales y las mediciones tienen persistencia PostgreSQL. Usuarios y sesiones humanos todavía se almacenan en memoria y se pierden al reiniciar. El proyecto sigue en desarrollo.

El modo en vivo usa WebSocket para el ESP32 y Socket.IO para los clientes de usuario, con concesiones temporales por sensor y permisos por invernadero. El firmware Arduino se mantiene en el proyecto independiente `esp32__client`; completar los drivers físicos y validar el sketch en Arduino IDE antes de conectarlo a hardware real.

Los detalles, ejemplos y limitaciones de cada funcionalidad se documentan dentro de su módulo. Mantener este README como una guía general de instalación y navegación.
