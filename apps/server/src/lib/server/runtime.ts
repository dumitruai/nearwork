import * as env from '$app/env/private';
import { createDatabase } from './db';
import { createAuth } from './auth';

let runtime: ReturnType<typeof initialize> | undefined;
function initialize() {
  if (!env.DATABASE_URL || !env.BETTER_AUTH_SECRET || !env.BETTER_AUTH_URL) {
    throw new Error('DATABASE_URL, BETTER_AUTH_SECRET, and BETTER_AUTH_URL are required.');
  }
  const origins = (env.TRUSTED_ORIGINS ?? env.BETTER_AUTH_URL).split(',').map(s => s.trim()).filter(Boolean);
  const { db } = createDatabase(env.DATABASE_URL);
  const auth = createAuth(db, { baseURL: env.BETTER_AUTH_URL, secret: env.BETTER_AUTH_SECRET, origins });
  return { db, auth, origins };
}
export function getRuntime() { return runtime ??= initialize(); }
