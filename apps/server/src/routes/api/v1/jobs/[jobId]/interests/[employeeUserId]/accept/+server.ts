import type { RequestHandler } from './$types';
import { endpoint } from '#server/api/endpoint';
import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import { jobs, jobDecisions, matches, conversations } from '#server/db/schema';
import { fail, respond } from '#server/api/http';
import { nonempty } from '#server/api/validation';
import { publishChat } from '#server/realtime/publish';

export const POST: RequestHandler = endpoint(async ({ db, params, uid, requireProfile }) => {
  await requireProfile('employer');
  const jobId = z.uuid().parse(params.jobId);
  const employeeUserId = nonempty(128).parse(params.employeeUserId);
  const result = await db.transaction(async (tx) => {
    const [job] = await tx.select().from(jobs).where(and(eq(jobs.id, jobId), eq(jobs.employerUserId, uid))).for('update');
    if (!job || job.isDemo)
      fail(404, 'NOT_FOUND', 'Job not found.');
    const [decision] = await tx.select().from(jobDecisions)
      .where(and(eq(jobDecisions.employeeUserId, employeeUserId), eq(jobDecisions.jobId, jobId)));
    if (decision?.decision !== 'interested')
      fail(404, 'NOT_FOUND', 'Interest not found.');
    let [match] = await tx.select().from(matches).where(and(eq(matches.jobId, jobId), eq(matches.employeeUserId, employeeUserId)));
    if (!match) {
      if (!job.isActive)
        fail(409, 'JOB_INACTIVE', 'This job is no longer active.');
      [match] = await tx.insert(matches).values({ employeeUserId, jobId, source: 'employer_acceptance' }).returning();
    }
    await tx.insert(conversations).values({ matchId: match.id }).onConflictDoNothing();
    const [conversation] = await tx.select().from(conversations).where(eq(conversations.matchId, match.id));
    return { match, conversation };
  });
  await publishChat([uid, employeeUserId], { type: 'conversation', conversationId: result.conversation.id, data: {} });
  return respond(result);
});
