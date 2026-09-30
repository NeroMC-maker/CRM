import { drizzle, type NodePgDatabase } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import * as schema from './schema';

export type Db = NodePgDatabase<typeof schema>;
/** Transacción o conexión: los servicios aceptan cualquiera de las dos. */
export type DbOrTx = Db | Parameters<Parameters<Db['transaction']>[0]>[0];

export function createDb(url: string): { db: Db; pool: pg.Pool } {
  const pool = new pg.Pool({ connectionString: url, max: 10 });
  return { db: drizzle(pool, { schema }), pool };
}

const globalForDb = globalThis as unknown as { __tlDb?: { db: Db; pool: pg.Pool } };

/** Conexión compartida por proceso. */
export function getDb(): Db {
  if (!globalForDb.__tlDb) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error('DATABASE_URL no está configurada');
    globalForDb.__tlDb = createDb(url);
  }
  return globalForDb.__tlDb.db;
}

export { schema };
