import type { Plugin } from 'vite';
import { Server } from 'node:http';
import { createGateway, gatewayConfig } from './src/lib/server/realtime/gateway.ts';

/** Attach realtime to the existing Vite HTTP server, not another port/process. */
export function realtimePlugin(env: Record<string, string | undefined>): Plugin {
  let gateway: Awaited<ReturnType<typeof createGateway>> | undefined;
  return {
    name: 'nearwork-realtime',
    async configureServer(server) {
      if (!(server.httpServer instanceof Server)) throw new Error('Realtime requires an HTTP/1 Vite server.');
      gateway = await createGateway({ ...gatewayConfig(env), http: server.httpServer });
    },
    async closeBundle() {
      await gateway?.close();
      gateway = undefined;
    },
  };
}
