import assert from 'node:assert/strict';
import { test } from 'node:test';
import { io, type Socket } from 'socket.io-client';
import { createGateway } from '../src/lib/server/realtime/gateway';
import { signToken, verifyToken } from '../src/lib/server/realtime/token';
import { channel, redisClient } from '../src/lib/server/realtime/broker';

const secret = 'integration-realtime-secret-with-at-least-32-characters';
const origin = 'http://localhost:5173';
const redisURL = process.env.REDIS_URL || 'redis://localhost:6379';
function event<T>(socket: Socket, name: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => { socket.off(name, handler); reject(new Error(`Timed out: ${name}`)); }, 5000);
    const handler = (value: T) => { clearTimeout(timer); resolve(value); };
    socket.once(name, handler);
  });
}
function client(port: number, token: string, clientOrigin = origin) {
  return io(`http://127.0.0.1:${port}`, { transports: ['websocket'], autoConnect: false, reconnection: false,
    extraHeaders: { origin: clientOrigin }, auth: { token } });
}

test('tokens reject modification, wrong secret, and expiry', () => {
  const token = signToken({ userId: 'one', exp: Date.now() + 10000 }, secret);
  assert.equal(verifyToken(token, secret).userId, 'one');
  assert.throws(() => verifyToken(`${token}tampered`, secret));
  assert.throws(() => verifyToken(token, 'other-secret'));
  assert.throws(() => verifyToken(signToken({ userId: 'one', exp: 1 }, secret), secret));
});

test('two gateway instances deliver private events, scope typing, reject origins and expire sessions', async () => {
  const first = await createGateway({ secret, origins: [origin], redisURL });
  const second = await createGateway({ secret, origins: [origin], redisURL });
  const pub = redisClient(redisURL);
  const sockets: Socket[] = [];
  try {
    await Promise.all([new Promise<void>(r => first.http.listen(0, '127.0.0.1', r)), new Promise<void>(r => second.http.listen(0, '127.0.0.1', r)), pub.connect()]);
    const p1 = (first.http.address() as { port: number }).port, p2 = (second.http.address() as { port: number }).port;
    const token = (userId: string) => signToken({ userId, conversationId: 'conversation', participants: ['alice', 'bob'], exp: Date.now() + 60000 }, secret);
    const alice = client(p1, token('alice')), bob = client(p2, token('bob')), outsider = client(p2, token('outsider'));
    sockets.push(alice, bob, outsider);
    await Promise.all(sockets.map(s => { const ready = event(s, 'ready'); s.connect(); return ready; }));
    const outsideEvents: any[] = [];
    outsider.on('chat', value => { outsideEvents.push(value); });
    const a = event<any>(alice, 'chat'), b = event<any>(bob, 'chat');
    await pub.publish(channel, JSON.stringify({ users: ['alice', 'bob'], event: { type: 'message', conversationId: 'conversation', data: { body: 'hello' } } }));
    assert.equal((await a).data.body, 'hello'); assert.equal((await b).data.body, 'hello');
    const typing = event<any>(bob, 'chat'); alice.emit('typing', { participants: ['outsider'] });
    assert.equal((await typing).type, 'typing');
    // A sentinel proves the preceding events on this channel have been processed.
    const sentinel = event<any>(outsider, 'chat');
    await pub.publish(channel, JSON.stringify({ users: ['outsider'], event: { type: 'conversation', data: {} } }));
    assert.equal((await sentinel).type, 'conversation');
    assert.deepEqual(outsideEvents.map(e => e.type), ['conversation']);
    const denied = client(p1, token('alice'), 'https://evil.example');
    sockets.push(denied); const rejected = event(denied, 'connect_error'); denied.connect(); await rejected;
    const forged = client(p1, `${token('alice')}broken`);
    sockets.push(forged); const invalid = event(forged, 'connect_error'); forged.connect(); await invalid;
    const short = client(p1, signToken({ userId: 'short', exp: Date.now() + 1000 }, secret));
    sockets.push(short); const ready = event(short, 'ready'); short.connect(); await ready;
    await event(short, 'disconnect');
  } finally {
    sockets.forEach(s => s.disconnect());
    pub.destroy();
    await Promise.all([first.close(), second.close()]);
  }
});
