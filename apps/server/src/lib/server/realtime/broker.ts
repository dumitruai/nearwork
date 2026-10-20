import { createClient } from 'redis';

export type ChatEvent = {
  type: 'message' | 'read' | 'conversation' | 'typing' | 'presence';
  conversationId: string;
  data: unknown;
};
export const channel = 'nearwork:chat:v1';
export function redisClient(url: string, persistent = false) {
  const client = createClient({ url, disableOfflineQueue: true, socket: { connectTimeout: 3000,
    reconnectStrategy: retries => !persistent && retries > 3 ? new Error('Redis unavailable') : Math.min(1000, 100 * 2 ** Math.min(retries, 4)) } });
  client.on('error', () => console.error('Realtime Redis connection unavailable'));
  return client;
}
let publisher: ReturnType<typeof redisClient> | undefined;
let connecting: Promise<unknown> | undefined;
async function getPublisher(url: string) {
  publisher ??= redisClient(url);
  if (!publisher.isOpen) {
    connecting ??= publisher.connect().finally(() => { connecting = undefined; });
  }
  // isOpen becomes true before authentication/ready; concurrent callers must
  // share the same connection promise rather than publishing during startup.
  if (connecting) await connecting;
  return publisher;
}
export async function publish(url: string, users: string[], event: ChatEvent) {
  await (await getPublisher(url)).publish(channel, JSON.stringify({ users: [...new Set(users)], event }));
}
export async function messageQuota(url: string, userId: string) {
  const client = await getPublisher(url);
  return Number(await client.eval(`
    local count = redis.call('INCR', KEYS[1])
    if count == 1 then redis.call('EXPIRE', KEYS[1], 60) end
    return count
  `, { keys: [`nearwork:send-limit:${userId}`], arguments: [] }));
}
