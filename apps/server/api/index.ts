import { createServer, type RequestListener } from 'node:http';
import { createGateway, gatewayConfig } from '../src/lib/server/realtime/gateway.js';

// adapter-node defaults to HTTPS. Derive the scheme from our configured public
// URL, not a caller-controlled forwarding header, so local HTTP also works.
process.env.PROTOCOL_HEADER = 'x-nearwork-protocol';
const protocol = new URL(process.env.BETTER_AUTH_URL!).protocol.slice(0, -1);
// The adapter output is generated JavaScript, not source for checkJs to inspect.
// vercel.json explicitly includes build/** in the function bundle.
const handlerPath = '../build/handler.js';
const { handler }: { handler: RequestListener } = await import(handlerPath);
// Both Vercel and the local production launcher use this same HTTP server.
export const gateway = await createGateway({ ...gatewayConfig(process.env), http: createServer((req, res) => {
  req.headers['x-nearwork-protocol'] = protocol;
  handler(req, res);
}) });
export default gateway.http;
