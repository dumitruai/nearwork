import type { RequestHandler } from './$types';
import * as env from '$app/env/private';
import { z } from 'zod';
import { endpoint } from '#server/api/endpoint';
import { requireConversation } from '#server/api/conversations';
import { respond, fail } from '#server/api/http';
import { signToken } from '#server/realtime/token';

export const GET: RequestHandler = endpoint(async ({ db, uid, url }) => {
  if (!env.REALTIME_SECRET || !env.REDIS_URL) fail(503, 'REALTIME_UNAVAILABLE', 'Realtime is not configured.');
  const query = z.object({ conversationId: z.uuid().optional() }).strict().parse(Object.fromEntries(url.searchParams));
  const conversation = query.conversationId ? await requireConversation(db, uid, query.conversationId) : undefined;
  const exp = Date.now() + 5 * 60_000;
  return respond({ token: signToken({ userId: uid, conversationId: query.conversationId,
    participants: conversation ? [conversation.employeeUserId, conversation.employerUserId] : undefined, exp }, env.REALTIME_SECRET), expiresAt: exp });
});
