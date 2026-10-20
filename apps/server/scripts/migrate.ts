import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { createDatabase } from '../src/lib/server/db/index';
import { fileURLToPath } from 'node:url';
if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required.');
const { db, pool } = createDatabase(process.env.DATABASE_URL);
try {
  await migrate(db, { migrationsFolder: fileURLToPath(new URL('../drizzle', import.meta.url)) });
  console.log('Migrations applied.');
} finally { await pool.end(); }
