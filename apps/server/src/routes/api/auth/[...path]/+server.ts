import { getRuntime } from '../../../../lib/server/runtime';
import type { RequestHandler } from './$types';
export const GET: RequestHandler = ({ request }) => getRuntime().auth.handler(request);
export const POST: RequestHandler = ({ request }) => getRuntime().auth.handler(request);
