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

## Documentación por módulo

- [Configuración y variables de entorno](src/config/README.md).
- [Autenticación y uso desde Android](src/auth/README.md).
- [Autorización](src/auth/authorization.md).
- [Usuarios](src/users/README.md).
- [Base de datos](src/db/README.md).

## Verificación

```powershell
npm run build
npm run lint
npm test -- --runInBand
npm run test:e2e -- --runInBand
```

Las pruebas unitarias no necesitan una base de datos. Las pruebas e2e actuales requieren la configuración de entorno y una base accesible.

## Alcance actual

La conexión PostgreSQL está disponible, pero usuarios y sesiones todavía se almacenan en memoria y se pierden al reiniciar. El proyecto sigue en desarrollo.

Los detalles, ejemplos y limitaciones de cada funcionalidad se documentan dentro de su módulo. Mantener este README como una guía general de instalación y navegación.
