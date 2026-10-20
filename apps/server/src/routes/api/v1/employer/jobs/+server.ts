import type { RequestHandler } from './$types';
import { endpoint } from '#server/api/endpoint';
import { asc, desc, eq } from 'drizzle-orm';
import { jobs } from '#server/db/schema';
import { respond } from '#server/api/http';
import { pageInput } from '#server/api/validation';
import { publicJob } from '#server/api/jobs';

export const GET: RequestHandler = endpoint(async ({ db, url, uid, requireProfile }) => {
  await requireProfile('employer');
  const { limit, offset } = pageInput.parse(Object.fromEntries(url.searchParams));
  return respond((await db.select().from(jobs).where(eq(jobs.employerUserId, uid))
    .orderBy(desc(jobs.createdAt), asc(jobs.id)).limit(limit).offset(offset)).map(publicJob));
});
