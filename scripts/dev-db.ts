/**
 * Postgres embebido para desarrollo (sin Docker ni instalación).
 * Datos en .data/pg. En producción se usa Neon vía DATABASE_URL.
 */
import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import EmbeddedPostgres from 'embedded-postgres';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dataDir = path.join(root, '.data', 'pg');
const port = Number(process.env.DEV_DB_PORT ?? 54330);

const pg = new EmbeddedPostgres({
  databaseDir: dataDir,
  user: 'tulicencia',
  password: 'tulicencia',
  port,
  persistent: true,
  onLog: () => {},
  // Sin esto, en Windows el clúster hereda WIN1252 y rechaza tildes/emojis.
  initdbFlags: ['--encoding=UTF8', '--locale=C'],
});

const firstRun = !fs.existsSync(path.join(dataDir, 'PG_VERSION'));
if (firstRun) await pg.initialise();
await pg.start();
if (firstRun) await pg.createDatabase('tulicencia');

console.log(`Postgres de desarrollo listo en postgres://tulicencia:tulicencia@127.0.0.1:${port}/tulicencia`);

const stop = async () => {
  await pg.stop();
  process.exit(0);
};
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
setInterval(() => {}, 1 << 30);
