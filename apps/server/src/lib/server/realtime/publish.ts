import * as env from '$app/env/private';
import { publish, messageQuota, type ChatEvent } from './broker';
import { fail } from '../api/http';

export async function limitChat(userId: string) {
  if (!env.REDIS_URL) fail(503, 'REALTIME_UNAVAILABLE', 'Messaging is temporarily unavailable.');
  let count: number;
  try { count = await messageQuota(env.REDIS_URL, userId); }
  catch { fail(503, 'REALTIME_UNAVAILABLE', 'Messaging is temporarily unavailable. Please retry.'); }
  if (count > 60) fail(429, 'MESSAGE_RATE_LIMIT', 'Too many messages. Please wait a minute.');
}

export async function publishChat(users: string[], event: ChatEvent) {
  // A failed broadcast must remain retryable; message IDs and receipts are idempotent.
  if (!env.REDIS_URL) fail(503, 'REALTIME_UNAVAILABLE', 'Messaging is temporarily unavailable. Please retry.');
  try { await publish(env.REDIS_URL, users, event); }
  catch { fail(503, 'REALTIME_UNAVAILABLE', 'Your change was saved. Retry to notify the recipient.'); }
}
