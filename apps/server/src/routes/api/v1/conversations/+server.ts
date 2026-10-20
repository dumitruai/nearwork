import type { RequestHandler } from './$types';
import { endpoint } from '#server/api/endpoint';
import { asc, eq, sql } from 'drizzle-orm';
import { user, employerProfiles, jobs, matches, conversations } from '#server/db/schema';
import { respond } from '#server/api/http';
import { pageInput } from '#server/api/validation';
import { ensureGeneratedConversations } from '#server/generated-accounts';

export const GET: RequestHandler = endpoint(async ({ db, url, identity, uid }) => {
  const { limit, offset } = pageInput.parse(Object.fromEntries(url.searchParams));
  if (identity.profileType === 'employee') await ensureGeneratedConversations(db, uid);
  const rows = await db.select({
    id: conversations.id, jobId: jobs.id, jobRole: jobs.role,
    companyName: employerProfiles.companyName, employeeName: user.name,
    createdAt: conversations.createdAt,
    latestMessage: sql<string | null>`(select m.body from messages m where m.conversation_id = ${conversations.id} order by m.created_at desc, m.id desc limit 1)`,
    latestSenderId: sql<string | null>`(select m.sender_user_id from messages m where m.conversation_id = ${conversations.id} order by m.created_at desc, m.id desc limit 1)`,
    latestAt: sql<string>`coalesce((select max(m.created_at) from messages m where m.conversation_id = ${conversations.id}), ${conversations.createdAt})`,
    unreadCount: sql<number>`(select count(*)::int from messages m where m.conversation_id = ${conversations.id} and m.sender_user_id <> ${uid} and m.read_at is null)`,
  }).from(conversations)
    .innerJoin(matches, eq(matches.id, conversations.matchId))
    .innerJoin(jobs, eq(jobs.id, matches.jobId))
    .innerJoin(employerProfiles, eq(employerProfiles.userId, jobs.employerUserId))
    .innerJoin(user, eq(user.id, matches.employeeUserId))
    .where(identity.profileType === 'employee' ? eq(matches.employeeUserId, uid) : eq(jobs.employerUserId, uid))
    .orderBy(sql`coalesce((select max(m.created_at) from messages m where m.conversation_id = ${conversations.id}), ${conversations.createdAt}) desc`, asc(conversations.id))
    .limit(limit).offset(offset);
  return respond(rows);
});
