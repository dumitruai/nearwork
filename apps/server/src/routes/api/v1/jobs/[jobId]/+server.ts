import type { RequestHandler } from './$types';
import { endpoint } from '#server/api/endpoint';
import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import { employerProfiles, jobs, jobDecisions } from '#server/db/schema';
import { fail, body, respond } from '#server/api/http';
import { publicJob } from '#server/api/jobs';

export const GET: RequestHandler = endpoint(async ({ db, params, identity, uid }) => {
  const jobId = z.uuid().parse(params.jobId);
  const [row] = await db.select({ job: jobs, companyName: employerProfiles.companyName }).from(jobs)
    .innerJoin(employerProfiles, eq(jobs.employerUserId, employerProfiles.userId)).where(eq(jobs.id, jobId));
  if (!row)
    fail(404, 'NOT_FOUND', 'Job not found.');
  if (identity.profileType === 'employer' && row.job.employerUserId !== uid)
    fail(404, 'NOT_FOUND', 'Job not found.');
  if (identity.profileType === 'employee' && !row.job.isActive) {
    const [saved] = await db.select().from(jobDecisions).where(and(eq(jobDecisions.jobId, jobId), eq(jobDecisions.employeeUserId, uid)));
    if (saved?.decision !== 'interested')
      fail(404, 'NOT_FOUND', 'Job not found.');
  }
  return respond({ ...publicJob(row.job), companyName: row.companyName });
});

export const PATCH: RequestHandler = endpoint(async ({ db, request, params, uid, requireProfile }) => {
  await requireProfile('employer');
  const jobId = z.uuid().parse(params.jobId);
  const data = await body(request, z.object({ isActive: z.boolean() }).strict());
  const [job] = await db.update(jobs).set({ ...data, updatedAt: new Date() })
    .where(and(eq(jobs.id, jobId), eq(jobs.employerUserId, uid), eq(jobs.isDemo, false))).returning();
  if (!job)
    fail(404, 'NOT_FOUND', 'Editable job not found.');
  return respond(publicJob(job));
});
