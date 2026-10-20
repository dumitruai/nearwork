import type { RequestHandler } from './$types';
import { endpoint } from '#server/api/endpoint';
import { and, eq, isNull, ne, inArray } from 'drizzle-orm';
import { z } from 'zod';
import { messages } from '#server/db/schema';
import { body, respond } from '#server/api/http';
import { requireConversation } from '#server/api/conversations';
import { publishChat } from '#server/realtime/publish';

export const POST: RequestHandler = endpoint(async ({ db, request, params, uid }) => {
  const conversationId = z.uuid().parse(params.conversationId);
  const conversation = await requireConversation(db, uid, conversationId);
  const data = await body(request, z.object({ messageIds: z.array(z.uuid()).min(1).max(100) }).strict());
  await db.update(messages).set({ readAt: new Date() }).where(and(eq(messages.conversationId, conversationId), ne(messages.senderUserId, uid), inArray(messages.id, data.messageIds), isNull(messages.readAt)));
  // Include already-read rows so an idempotent retry repairs a failed publish.
  const items = await db.select({ id: messages.id, readAt: messages.readAt }).from(messages)
    .where(and(eq(messages.conversationId, conversationId), ne(messages.senderUserId, uid), inArray(messages.id, data.messageIds)));
  await publishChat([conversation.employeeUserId, conversation.employerUserId],
    { type: 'read', conversationId, data: { items } });
  return respond({ ok: true, items });
});
