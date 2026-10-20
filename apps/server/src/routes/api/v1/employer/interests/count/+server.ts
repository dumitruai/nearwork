import type { RequestHandler } from './$types';
import { and, eq, isNull, sql } from 'drizzle-orm';
import { endpoint } from '#server/api/endpoint';
import { respond } from '#server/api/http';
import { user, employeeProfiles, jobs, jobDecisions, matches } from '#server/db/schema';

export const GET: RequestHandler = endpoint(async ({ db, uid, requireProfile }) => {
  await requireProfile('employer');
  const [result] = await db.select({ count: sql<number>`count(*)::int` })
    .from(jobDecisions).innerJoin(jobs, eq(jobs.id, jobDecisions.jobId))
    .innerJoin(user, eq(user.id, jobDecisions.employeeUserId))
    .innerJoin(employeeProfiles, eq(employeeProfiles.userId, user.id))
    .leftJoin(matches, and(eq(matches.jobId, jobDecisions.jobId), eq(matches.employeeUserId, user.id)))
    .where(and(eq(jobs.employerUserId, uid), eq(jobs.isDemo, false), eq(jobDecisions.decision, 'interested'), isNull(matches.id)));
  return respond(result);
});
