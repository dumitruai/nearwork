import { defineEnvVars } from '@sveltejs/kit/env';
import { z } from 'zod';
// Runtime requires these on the first API request; builds need no database secrets.
export const variables = defineEnvVars({
  REDIS_URL: { schema: z.string().optional() },
  REALTIME_SECRET: { schema: z.string().min(32).optional() },
  DATABASE_URL: { schema: z.string().optional() },
  BETTER_AUTH_SECRET: { schema: z.string().min(32).optional() },
  BETTER_AUTH_URL: { schema: z.url().optional() },
  TRUSTED_ORIGINS: { schema: z.string().optional() },
  ENABLE_LOCATION_MOCKS: { schema: z.enum(['true', 'false']).optional() },
  ENABLE_APPLICANT_BOTS: { schema: z.enum(['true', 'false']).optional() },
  XAI_API_KEY: { schema: z.string().optional() },
  XAI_MODEL: { schema: z.string().optional() },
});
