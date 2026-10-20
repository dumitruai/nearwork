import type { RequestHandler } from './$types';
import { endpoint } from '#server/api/endpoint';
import { and, asc, desc, eq, isNull } from 'drizzle-orm';
import { user, employeeProfiles, jobs, jobDecisions, matches } from '#server/db/schema';
import { respond } from '#server/api/http';
import { pageInput } from '#server/api/validation';
import { publicJob } from '#server/api/jobs';

export const GET: RequestHandler = endpoint(async ({ db, url, uid, requireProfile }) => {
  await requireProfile('employer');
  const { limit, offset } = pageInput.parse(Object.fromEntries(url.searchParams));
  const rows = await db.select({ decision: jobDecisions, job: jobs,
    employee: { userId: user.id, name: user.name, bio: employeeProfiles.bio,
      categories: employeeProfiles.categories, availability: employeeProfiles.availability } })
    .from(jobDecisions).innerJoin(jobs, eq(jobs.id, jobDecisions.jobId))
    .innerJoin(user, eq(user.id, jobDecisions.employeeUserId))
    .innerJoin(employeeProfiles, eq(employeeProfiles.userId, user.id))
    .leftJoin(matches, and(eq(matches.jobId, jobDecisions.jobId), eq(matches.employeeUserId, user.id)))
    .where(and(eq(jobs.employerUserId, uid), eq(jobs.isDemo, false), eq(jobDecisions.decision, 'interested'), isNull(matches.id)))
    .orderBy(desc(jobDecisions.createdAt), asc(jobs.id), asc(user.id)).limit(limit).offset(offset);
  return respond(rows.map(row => ({ ...row, job: publicJob(row.job) })));
});
