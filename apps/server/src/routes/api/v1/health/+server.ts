import type { RequestHandler } from './$types';
import { publicEndpoint } from '#server/api/endpoint';
import { sql } from 'drizzle-orm';

export const GET: RequestHandler = publicEndpoint(async ({ db }) => {
  await db.execute(sql `SELECT 1`);
  return Response.json({ data: { status: 'ok' } });
});
