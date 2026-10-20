import type { RequestHandler } from './$types';
import { endpoint } from '#server/api/endpoint';
import { asc, desc, eq } from 'drizzle-orm';
import { user, employerProfiles, jobs, matches, conversations } from '#server/db/schema';
import { respond } from '#server/api/http';
import { savedPageInput } from '#server/api/validation';
import { publicJobWithDistance } from '#server/api/jobs';
import { ensureGeneratedConversations } from '#server/generated-accounts';

export const GET: RequestHandler = endpoint(async ({ db, url, identity, uid }) => {
  const query = savedPageInput.parse(Object.fromEntries(url.searchParams));
  const { limit, offset } = query;
  if (identity.profileType === 'employee') await ensureGeneratedConversations(db, uid);
  const rows = await db.select({ match: matches, job: jobs, conversationId: conversations.id,
    companyName: employerProfiles.companyName, employeeName: user.name })
    .from(matches).innerJoin(jobs, eq(jobs.id, matches.jobId))
    .innerJoin(employerProfiles, eq(employerProfiles.userId, jobs.employerUserId))
    .innerJoin(user, eq(user.id, matches.employeeUserId))
    .leftJoin(conversations, eq(conversations.matchId, matches.id))
    .where(identity.profileType === 'employee' ? eq(matches.employeeUserId, uid) : eq(jobs.employerUserId, uid))
    .orderBy(desc(matches.createdAt), asc(matches.id)).limit(limit).offset(offset);
  return respond(rows.map(row => ({ ...row, job: publicJobWithDistance(row.job, query) })));
});
