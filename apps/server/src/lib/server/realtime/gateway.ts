import { createServer, type Server as HttpServer } from 'node:http';
import { Server } from 'socket.io';
import { redisClient, channel } from './broker.js';
import { verifyToken, type Claims } from './token.js';

const socketPath = '/api/socket-io/socket.io';

export function gatewayConfig(env: Record<string, string | undefined>) {
  const { REDIS_URL, REALTIME_SECRET, TRUSTED_ORIGINS } = env;
  if (!REDIS_URL || !REALTIME_SECRET || REALTIME_SECRET.length < 32 || !TRUSTED_ORIGINS) {
    throw new Error('REDIS_URL, REALTIME_SECRET (32+ characters), and TRUSTED_ORIGINS are required.');
  }
  return { redisURL: REDIS_URL, secret: REALTIME_SECRET,
    origins: TRUSTED_ORIGINS.split(',').map(s => s.trim()).filter(Boolean), path: socketPath };
}

export async function createGateway(config: { redisURL: string; secret: string; origins: string[]; path?: string; http?: HttpServer }) {
  const http = config.http ?? createServer((_req, res) => { res.writeHead(200); res.end('Nearwork realtime'); });
  const io = new Server(http, {
    path: config.path ?? '/socket.io', transports: ['websocket'], maxHttpBufferSize: 8192,
    // Vite HMR shares this server in development.
    destroyUpgrade: false,
    allowRequest: (req, done) => done(null, !!req.headers.origin && config.origins.includes(req.headers.origin)),
  });
  const pub = redisClient(config.redisURL, true), sub = redisClient(config.redisURL, true);
  // Clients must resync if an instance loses its event subscription.
  sub.on('reconnecting', () => io.disconnectSockets(true));
  pub.on('reconnecting', () => io.disconnectSockets(true));
  try {
    await Promise.all([pub.connect(), sub.connect()]);
  } catch (error) {
    if (pub.isOpen) pub.destroy();
    if (sub.isOpen) sub.destroy();
    await new Promise<void>(resolve => io.close(() => resolve()));
    throw error;
  }
  await sub.subscribe(channel, raw => {
    try {
      const { users, event } = JSON.parse(raw);
      io.to(users.map((id: string) => `user:${id}`)).emit('chat', event);
    } catch { console.error('Invalid realtime event'); }
  });
  io.use((socket, next) => {
    try {
      if (!pub.isReady || !sub.isReady) throw new Error('Unavailable');
      socket.data.claims = verifyToken(socket.handshake.auth.token, config.secret);
      next();
    } catch { next(new Error('Realtime authentication unavailable.')); }
  });
  io.on('connection', socket => {
    const claims = socket.data.claims as Claims;
    socket.join(`user:${claims.userId}`);
    const expiry = setTimeout(() => socket.disconnect(true), Math.max(1, claims.exp - Date.now()));
    let lastTyping = 0;
    socket.on('typing', () => {
      if (!claims.conversationId || !claims.participants || Date.now() - lastTyping < 1000) return;
      lastTyping = Date.now();
      void pub.publish(channel, JSON.stringify({
        users: claims.participants.filter(id => id !== claims.userId),
        event: { type: 'typing', conversationId: claims.conversationId, data: { userId: claims.userId } },
      })).catch(() => socket.disconnect(true));
    });
    // Presence is ephemeral and expires if an instance dies without cleanup.
    const key = `nearwork:presence:${claims.userId}:${socket.id}`;
    const heartbeat = () => { void pub.set(key, '1', { EX: 60 }).catch(() => socket.disconnect(true)); };
    heartbeat();
    const timer = setInterval(heartbeat, 30_000);
    socket.on('disconnect', () => { clearTimeout(expiry); clearInterval(timer); void pub.del(key).catch(() => {}); });
    socket.emit('ready');
  });
  return {
    http, io,
    async close() { await new Promise<void>(resolve => io.close(() => resolve())); pub.destroy(); sub.destroy(); },
  };
}
