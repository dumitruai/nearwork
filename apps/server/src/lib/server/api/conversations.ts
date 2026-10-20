import { and, eq, or } from 'drizzle-orm';
import type { Database } from '../db';
import { conversations, matches, jobs } from '../db/schema';
import { fail } from './http';

/** Message history, sending, and read receipts all require the same participants. */
export async function requireConversation(db: Database, userId: string, conversationId: string) {
  const [conversation] = await db.select({ id: conversations.id, employeeUserId: matches.employeeUserId, employerUserId: jobs.employerUserId }).from(conversations)
    .innerJoin(matches, eq(matches.id, conversations.matchId)).innerJoin(jobs, eq(jobs.id, matches.jobId))
    .where(and(eq(conversations.id, conversationId),
      or(eq(matches.employeeUserId, userId), eq(jobs.employerUserId, userId))));
  if (!conversation) fail(404, 'NOT_FOUND', 'Conversation not found.');
  return conversation;
}
