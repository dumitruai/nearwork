import type { RequestHandler } from './$types';
import { endpoint } from '#server/api/endpoint';
import { and, asc, desc, eq, isNull } from 'drizzle-orm';
import { employerProfiles, jobs, jobDecisions, matches } from '#server/db/schema';
import { respond } from '#server/api/http';
import { savedPageInput } from '#server/api/validation';
import { publicJobWithDistance } from '#server/api/jobs';

export const GET: RequestHandler = endpoint(async ({ db, url, uid, requireProfile }) => {
  await requireProfile('employee');
  const query = savedPageInput.parse(Object.fromEntries(url.searchParams));
  const { limit, offset } = query;
  const rows = await db.select({ decision: jobDecisions, job: jobs, companyName: employerProfiles.companyName })
    .from(jobDecisions).innerJoin(jobs, eq(jobs.id, jobDecisions.jobId))
    .innerJoin(employerProfiles, eq(employerProfiles.userId, jobs.employerUserId))
    .leftJoin(matches, and(eq(matches.jobId, jobDecisions.jobId), eq(matches.employeeUserId, uid)))
    .where(and(eq(jobDecisions.employeeUserId, uid), eq(jobDecisions.decision, 'interested'), isNull(matches.id)))
    .orderBy(desc(jobDecisions.createdAt), asc(jobs.id)).limit(limit).offset(offset);
  return respond(rows.map(row => ({ ...row, job: publicJobWithDistance(row.job, query) })));
});
