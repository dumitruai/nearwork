import type { RequestHandler } from './$types';
import { endpoint } from '#server/api/endpoint';
import { and, eq } from 'drizzle-orm';
import { z } from 'zod';
import { jobs, jobDecisions, matches, conversations, messages } from '#server/db/schema';
import { fail, body, respond } from '#server/api/http';

export const POST: RequestHandler = endpoint(async ({ db, request, params, uid, requireProfile }) => {
  await requireProfile('employee');
  const jobId = z.uuid().parse(params.jobId);
  const { decision } = await body(request, z.object({ decision: z.enum(['pass', 'interested']) }).strict());
  return respond(await db.transaction(async (tx) => {
    // All decisions and acceptances lock the job first, in the same order.
    const [job] = await tx.select().from(jobs).where(eq(jobs.id, jobId)).for('update');
    if (!job)
      fail(404, 'NOT_FOUND', 'Job not found.');
    const pair = and(eq(jobDecisions.employeeUserId, uid), eq(jobDecisions.jobId, jobId));
    let [saved] = await tx.select().from(jobDecisions).where(pair);
    if (saved && saved.decision !== decision)
      fail(409, 'DECISION_CONFLICT', 'A different decision is already saved.');
    if (!saved) {
      if (!job.isActive)
        fail(409, 'JOB_INACTIVE', 'This job is no longer active.');
      [saved] = await tx.insert(jobDecisions).values({ employeeUserId: uid, jobId, decision }).returning();
    }
    if (decision === 'interested' && job.isDemo && job.mockEmployerInterested)
      await tx.insert(matches).values({ employeeUserId: uid, jobId, source: 'demo' }).onConflictDoNothing();
    const [match] = await tx.select().from(matches).where(and(eq(matches.employeeUserId, uid), eq(matches.jobId, jobId)));
    let conversationId: string | null = null;
    if (match && job.isDemo) {
      const [created] = await tx.insert(conversations).values({ matchId: match.id }).onConflictDoNothing().returning();
      const conversation = created ?? (await tx.select().from(conversations).where(eq(conversations.matchId, match.id)))[0];
      conversationId = conversation.id;
      if (created) await tx.insert(messages).values({ conversationId, senderUserId: job.employerUserId,
        clientMessageId: crypto.randomUUID(), body: `Hi! Thanks for your interest in the ${job.role} role. Which shifts would work best for you?` });
    }
    return { decision: saved, match: match ?? null, conversationId };
  }));
});
