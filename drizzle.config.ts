import 'dotenv/config';
import { defineConfig } from 'drizzle-kit';

export default defineConfig({
  dialect: 'postgresql',
  schema: './core/db/schema.ts',
  out: './core/db/migrations',
  dbCredentials: { url: process.env.DATABASE_URL ?? '' },
});
