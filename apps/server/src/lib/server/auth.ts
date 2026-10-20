import { betterAuth } from 'better-auth';
import { drizzleAdapter } from 'better-auth/adapters/drizzle';
import { APIError } from 'better-auth/api';
import { z } from 'zod';
import type { Database } from './db';
import * as schema from './db/schema';

export function createAuth(db: Database, config: { baseURL: string; secret: string; origins: string[] }) {
  return betterAuth({
    database: drizzleAdapter(db, { provider: 'pg', schema, transaction: true }),
    baseURL: config.baseURL,
    secret: config.secret,
    trustedOrigins: config.origins,
    logger: {
      // Adapter errors may contain bound passwords/tokens. Keep logs metadata-only.
      log: (level) => { if (level === 'error' || level === 'warn') console.error(`Authentication ${level}`); },
    },
    emailAndPassword: { enabled: true, minPasswordLength: 10 },
    user: {
      additionalFields: {
        profileType: { type: ['employee', 'employer'], required: true, input: true,
          validator: { input: z.enum(['employee', 'employer']) } },
      },
    },
    databaseHooks: {
      user: {
        update: { before: async (data) => {
          if ('profileType' in data) throw new APIError('BAD_REQUEST', { message: 'Profile type cannot be changed.' });
        } },
      },
    },
    advanced: {
      // Cross-origin HTTPS native/web clients need secure, cross-site cookies.
      defaultCookieAttributes: config.baseURL.startsWith('https://')
        ? { sameSite: 'none', secure: true, httpOnly: true }
        : { sameSite: 'lax', httpOnly: true },
    },
  });
}
