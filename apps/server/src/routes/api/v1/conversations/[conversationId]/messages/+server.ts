import type { RequestHandler } from './$types';
import { endpoint } from '#server/api/endpoint';
import { and, desc, eq, lt, or } from 'drizzle-orm';
import { z } from 'zod';
import { messages } from '#server/db/schema';
import { fail, body, respond } from '#server/api/http';
import { nonempty, pageInput, cursorInput } from '#server/api/validation';
import { requireConversation } from '#server/api/conversations';
import { publishChat, limitChat } from '#server/realtime/publish';
import { ENABLE_APPLICANT_BOTS, XAI_API_KEY, XAI_MODEL } from '$app/env/private';
import { sendGeneratedReply } from '#server/generated-accounts';

export const POST: RequestHandler = endpoint(async ({ db, request, params, uid }) => {
  const conversationId = z.uuid().parse(params.conversationId);
  const conversation = await requireConversation(db, uid, conversationId);
  const data = await body(request, z.object({ clientMessageId: z.uuid(), body: nonempty(4000) }).strict());
  await limitChat(uid);
  const automated = await sendGeneratedReply(db, { conversationId, uid, ...data },
    { enabled: ENABLE_APPLICANT_BOTS === 'true', key: XAI_API_KEY, model: XAI_MODEL });
  if (automated) {
    for (const message of [automated.message, automated.reply])
      await publishChat([conversation.employeeUserId, conversation.employerUserId], { type: 'message', conversationId, data: message });
    return respond(automated.message);
  }
  const [inserted] = await db.insert(messages).values({ conversationId, senderUserId: uid, ...data }).onConflictDoNothing().returning();
  const message = inserted ?? (await db.select().from(messages).where(and(eq(messages.conversationId, conversationId), eq(messages.senderUserId, uid), eq(messages.clientMessageId, data.clientMessageId))))[0];
  if (message.body !== data.body)
    fail(409, 'MESSAGE_CONFLICT', 'This message ID already has different content.');
  await publishChat([conversation.employeeUserId, conversation.employerUserId], { type: 'message', conversationId, data: message });
  return respond(message);
});

export const GET: RequestHandler = endpoint(async ({ db, url, params, uid }) => {
  const conversationId = z.uuid().parse(params.conversationId);
  await requireConversation(db, uid, conversationId);
  const query = z.object({ limit: pageInput.shape.limit, before: z.string().optional() }).strict()
    .parse(Object.fromEntries(url.searchParams));
  let cursor: z.infer<typeof cursorInput> | undefined;
  if (query.before) {
    try {
      cursor = cursorInput.parse(JSON.parse(Buffer.from(query.before, 'base64url').toString()));
    }
    catch {
      fail(400, 'INVALID_CURSOR', 'Invalid history cursor.');
    }
  }
  const rows = await db.select().from(messages).where(and(eq(messages.conversationId, conversationId), cursor ? or(lt(messages.createdAt, new Date(cursor.createdAt)), and(eq(messages.createdAt, new Date(cursor.createdAt)), lt(messages.id, cursor.id))) : undefined))
    .orderBy(desc(messages.createdAt), desc(messages.id)).limit(query.limit + 1);
  const hasMore = rows.length > query.limit;
  const items = rows.slice(0, query.limit);
  const last = items.at(-1);
  return respond({ items: items.reverse(), nextCursor: hasMore && last
      ? Buffer.from(JSON.stringify({ createdAt: last.createdAt.toISOString(), id: last.id })).toString('base64url') : null });
});
