import type { RequestHandler } from './$types';
import { and, eq, isNull, ne, sql } from 'drizzle-orm';
import { endpoint } from '#server/api/endpoint';
import { respond } from '#server/api/http';
import { conversations, jobs, matches, messages } from '#server/db/schema';

export const GET: RequestHandler = endpoint(async ({ db, identity, uid }) => {
  const [result] = await db.select({ count: sql<number>`count(*)::int` })
    .from(messages)
    .innerJoin(conversations, eq(conversations.id, messages.conversationId))
    .innerJoin(matches, eq(matches.id, conversations.matchId))
    .innerJoin(jobs, eq(jobs.id, matches.jobId))
    .where(and(
      isNull(messages.readAt),
      ne(messages.senderUserId, uid),
      identity.profileType === 'employee'
        ? eq(matches.employeeUserId, uid)
        : eq(jobs.employerUserId, uid),
    ));
  return respond({ count: result.count });
});
