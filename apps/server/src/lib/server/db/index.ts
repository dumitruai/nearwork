import pg from 'pg';
import { drizzle } from 'drizzle-orm/node-postgres';
import * as schema from './schema';

export function createDatabase(connectionString: string) {
  const pool = new pg.Pool({ connectionString, max: 5, idleTimeoutMillis: 10000 });
  return { pool, db: drizzle(pool, { schema }) };
}
export type Database = ReturnType<typeof createDatabase>['db'];
