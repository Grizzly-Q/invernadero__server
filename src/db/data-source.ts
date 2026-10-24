import 'reflect-metadata';
import { existsSync, readFileSync } from 'node:fs';
import { parseEnv } from 'node:util';
import { DataSource } from 'typeorm';
import { databaseOptions } from './database-options';

// La CLI se ejecuta fuera de Nest; el entorno del proceso tiene prioridad sobre .env.
const local = existsSync('.env') ? parseEnv(readFileSync('.env', 'utf8')) : {};
const url = process.env.DATABASE_URL ?? local.DATABASE_URL;
if (!url)
  throw new Error('Configure DATABASE_URL antes de ejecutar migraciones.');

/** Conexión de la CLI; importar este archivo no ejecuta migraciones ni abre conexiones. */
export default new DataSource(databaseOptions(url));
