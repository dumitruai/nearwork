import { and, desc, eq, isNull, sql } from 'drizzle-orm';
import { availability } from '../../../../shared/domain';
import type { Database } from './db';
import { user, employeeProfiles, jobs, jobDecisions, matches, conversations, messages } from './db/schema';
import { applicantReply } from './applicant-reply';
import { fail } from './api/http';

type Transaction = Parameters<Parameters<Database['transaction']>[0]>[0];
const applicants = [
  { name: 'Alex Morgan', bio: 'Friendly and reliable, with customer service experience. Happy to learn and flexible about shifts.' },
  { name: 'Sam Taylor', bio: 'Organised and practical. Enjoys working with a team and available for afternoon and weekend shifts.' },
  { name: 'Jordan Lee', bio: 'Quick learner looking for a steady local role. Comfortable with busy shifts and hands-on work.' },
];

/** Called in the job creation transaction: jobs and their applicants commit together. */
export async function generateApplicants(tx: Transaction, job: typeof jobs.$inferSelect) {
  const result: string[] = [];
  for (const [index, persona] of applicants.entries()) {
    const id = `generated-applicant:${job.id}:${index}`;
    await tx.insert(user).values({ id, name: persona.name, email: `${id}@mock.nearwork.invalid`, profileType: 'employee' }).onConflictDoNothing();
    await tx.insert(employeeProfiles).values({ userId: id, bio: persona.bio, categories: [job.category], availability: [...availability] }).onConflictDoNothing();
    await tx.insert(jobDecisions).values({ employeeUserId: id, jobId: job.id, decision: 'interested' }).onConflictDoNothing();
    await tx.insert(matches).values({ employeeUserId: id, jobId: job.id, source: 'demo' }).onConflictDoNothing();
    const [match] = await tx.select().from(matches).where(and(eq(matches.employeeUserId, id), eq(matches.jobId, job.id)));
    const [created] = await tx.insert(conversations).values({ matchId: match.id }).onConflictDoNothing().returning();
    const conversation = created ?? (await tx.select().from(conversations).where(eq(conversations.matchId, match.id)))[0];
    if (created) await tx.insert(messages).values({
      conversationId: conversation.id, senderUserId: id, clientMessageId: crypto.randomUUID(),
      body: [
        `Hi! I’m interested in your ${job.role} role. What does a typical shift look like?`,
        `Hello! Your ${job.role} position caught my eye. Are afternoon or weekend shifts available?`,
        `Hi, I’d like to hear more about the ${job.role} position. What experience would be most useful?`,
      ][index],
    });
    result.push(conversation.id);
  }
  return result;
}

function generatedApplicant(id: string) {
  return id.startsWith('generated-applicant:') || id.startsWith('test-applicant:');
}

/** Upgrade saved generated matches created before chat was supported. */
export async function ensureGeneratedConversations(db: Database, employeeId: string) {
  await db.transaction(async tx => {
    const missing = await tx.select({ matchId: matches.id, job: jobs }).from(matches)
      .innerJoin(jobs, eq(jobs.id, matches.jobId))
      .leftJoin(conversations, eq(conversations.matchId, matches.id))
      .where(and(eq(matches.employeeUserId, employeeId), eq(jobs.isDemo, true), isNull(conversations.id)));
    for (const row of missing) {
      const [conversation] = await tx.insert(conversations).values({ matchId: row.matchId }).onConflictDoNothing().returning();
      if (conversation) await tx.insert(messages).values({ conversationId: conversation.id,
        senderUserId: row.job.employerUserId, clientMessageId: crypto.randomUUID(),
        body: `Hi! Thanks for your interest in the ${row.job.role} role. Which shifts would work best for you?` });
    }
  });
}

/** Only server-generated participants may receive an automated reply. Real chats return null. */
export async function sendGeneratedReply(db: Database, input: {
  conversationId: string; uid: string; clientMessageId: string; body: string;
}, config: { enabled: boolean; key?: string; model?: string }) {
  if (!config.enabled) return null;
  const [context] = await db.select({ job: jobs, employeeId: matches.employeeUserId, name: user.name })
    .from(conversations).innerJoin(matches, eq(matches.id, conversations.matchId))
    .innerJoin(jobs, eq(jobs.id, matches.jobId)).innerJoin(user, eq(user.id, matches.employeeUserId))
    .where(eq(conversations.id, input.conversationId));
  if (!context) return null;
  const speaker = context.job.isDemo && input.uid === context.employeeId ? 'employer'
    : generatedApplicant(context.employeeId) && input.uid === context.job.employerUserId ? 'applicant' : null;
  if (!speaker) return null;
  const botId = speaker === 'employer' ? context.job.employerUserId : context.employeeId;
  return db.transaction(async tx => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`bot-chat:${input.conversationId}`}))`);
    const pair = and(eq(messages.conversationId, input.conversationId), eq(messages.clientMessageId, input.clientMessageId));
    const [previous] = await tx.select().from(messages).where(and(pair, eq(messages.senderUserId, input.uid)));
    if (previous && previous.body !== input.body) fail(409, 'MESSAGE_CONFLICT', 'This message ID already has different content.');
    const [existingReply] = await tx.select().from(messages).where(and(pair, eq(messages.senderUserId, botId)));
    if (previous && existingReply) return { message: previous, reply: existingReply };
    const [latest] = await tx.select().from(messages).where(eq(messages.conversationId, input.conversationId))
      .orderBy(desc(messages.createdAt), desc(messages.id)).limit(1);
    const sentAt = new Date(Math.max(Date.now(), (latest?.createdAt.getTime() ?? 0) + 1));
    const message = previous ?? (await tx.insert(messages).values({
      conversationId: input.conversationId, senderUserId: input.uid, clientMessageId: input.clientMessageId,
      body: input.body, createdAt: sentAt,
    }).returning())[0];
    const recent = await tx.select().from(messages).where(eq(messages.conversationId, input.conversationId))
      .orderBy(desc(messages.createdAt), desc(messages.id)).limit(12);
    const response = await applicantReply({
      speaker, name: speaker === 'applicant' ? context.name : undefined,
      role: context.job.role, schedule: context.job.scheduleSummary, description: context.job.description,
      history: recent.reverse().map(m => ({ role: m.senderUserId === botId ? 'assistant' : 'user', content: m.body })),
    }, config);
    const [reply] = await tx.insert(messages).values({
      conversationId: input.conversationId, senderUserId: botId, clientMessageId: input.clientMessageId,
      body: response.body, createdAt: new Date(Math.max(Date.now(), sentAt.getTime() + 1)),
    }).returning();
    return { message, reply };
  });
}
