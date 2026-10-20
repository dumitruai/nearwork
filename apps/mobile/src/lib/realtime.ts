import { io } from 'socket.io-client';
import { api, base } from './api';

export type ChatEvent = { type: 'message' | 'read' | 'conversation' | 'typing' | 'presence'; conversationId: string; data: any };
export function connectChat(options: {
  conversationId?: string; event: (event: ChatEvent) => void;
  ready: () => void; status: (connected: boolean) => void;
}) {
  let stopped = false, connecting = false, retry: ReturnType<typeof setTimeout> | undefined;
  // Vercel's cross-project HTTP rewrite does not forward WebSocket upgrades.
  // Hosted sockets connect directly to the same backend that serves the API.
  const socket = io(new URL(import.meta.env.VITE_REALTIME_URL || base || '/', window.location.origin).origin, {
    path: '/api/socket-io/socket.io',
    transports: ['websocket'], autoConnect: false, reconnection: false,
  });
  let delay = 1000;
  function schedule() {
    if (stopped || retry) return;
    options.status(false);
    retry = setTimeout(() => { retry = undefined; void connect(); }, delay + Math.random() * 500);
    delay = Math.min(delay * 2, 30_000);
  }
  async function connect() {
    if (stopped || connecting || socket.connected) return;
    connecting = true;
    try {
      const { token } = await api<{ token: string }>(`realtime/token${options.conversationId ? `?conversationId=${options.conversationId}` : ''}`);
      if (stopped) return;
      socket.auth = { token }; socket.connect();
    } catch { schedule(); }
    finally { connecting = false; }
  }
  socket.on('ready', () => { delay = 1000; options.status(true); options.ready(); });
  socket.on('chat', options.event);
  socket.on('disconnect', schedule);
  socket.on('connect_error', schedule);
  const resume = () => {
    if (document.visibilityState !== 'visible') return;
    options.ready();
    if (!socket.connected) { clearTimeout(retry); retry = undefined; void connect(); }
  };
  window.addEventListener('online', resume);
  window.addEventListener('focus', resume);
  window.addEventListener('nearwork:resume', resume);
  document.addEventListener('visibilitychange', resume);
  void connect();
  return {
    typing: () => { if (socket.connected) socket.emit('typing'); },
    close: () => {
      stopped = true; clearTimeout(retry); socket.removeAllListeners(); socket.disconnect();
      window.removeEventListener('online', resume); document.removeEventListener('visibilitychange', resume);
      window.removeEventListener('focus', resume); window.removeEventListener('nearwork:resume', resume);
    },
  };
}
