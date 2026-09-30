import 'dotenv/config';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { createDb } from '../core/db/client';

const url = process.env.DATABASE_URL;
if (!url) throw new Error('DATABASE_URL no está configurada');

const { db, pool } = createDb(url);
await migrate(db, { migrationsFolder: 'core/db/migrations' });
await pool.end();
console.log('Migraciones aplicadas.');
