import type { Handle } from '@sveltejs/kit/hooks';
import { getRuntime } from './lib/server/runtime';

export const handle: Handle = async ({ event, resolve }) => {
  if (!event.url.pathname.startsWith('/api/')) return resolve(event);
  const { origins } = getRuntime();
  const origin = event.request.headers.get('origin');
  if (origin && !origins.includes(origin)) {
    return Response.json({ error: { code: 'FORBIDDEN_ORIGIN', message: 'Origin is not allowed.' } }, { status: 403 });
  }
  const response = event.request.method === 'OPTIONS'
    ? new Response(null, { status: 204 })
    : await resolve(event);
  // Clone to permit modifying immutable responses from auth handlers.
  const result = new Response(response.body, response);
  result.headers.set('Cache-Control', 'no-store');
  result.headers.append('Vary', 'Origin');
  if (origin) {
    result.headers.set('Access-Control-Allow-Origin', origin);
    result.headers.set('Access-Control-Allow-Credentials', 'true');
    result.headers.set('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,OPTIONS');
    result.headers.set('Access-Control-Allow-Headers', 'Content-Type');
  }
  return result;
};
