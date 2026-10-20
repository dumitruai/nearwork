import { z } from 'zod';

class ApiError extends Error {
  constructor(public status: number, public code: string, message: string) { super(message); }
}
export function fail(status: number, code: string, message: string): never { throw new ApiError(status, code, message); }

export async function body<T>(request: Request, schema: z.ZodType<T>): Promise<T> {
  if (!request.headers.get('content-type')?.startsWith('application/json')) {
    fail(415, 'JSON_REQUIRED', 'Send application/json.');
  }
  // Read with a bound even when Content-Length is absent.
  const reader = request.body?.getReader();
  if (!reader) fail(400, 'INVALID_JSON', 'JSON body is required.');
  const chunks: Uint8Array[] = [];
  let size = 0;
  while (true) {
    const next = await reader.read();
    if (next.done) break;
    size += next.value.byteLength;
    if (size > 65536) { await reader.cancel(); fail(413, 'BODY_TOO_LARGE', 'Body exceeds 64 KiB.'); }
    chunks.push(next.value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  let value: unknown;
  try { value = JSON.parse(new TextDecoder().decode(bytes)); }
  catch { fail(400, 'INVALID_JSON', 'Malformed JSON.'); }
  return schema.parse(value);
}

export const respond = (data: unknown, status = 200) => Response.json({ data }, { status });

/** Apply the same JSON error contract to every application endpoint. */
export async function withApiErrors(handler: () => Promise<Response>): Promise<Response> {
  try {
    return await handler();
  } catch (error) {
    if (error instanceof z.ZodError) {
      return Response.json({ error: { code: 'VALIDATION_ERROR', message: 'Invalid input.', issues: error.issues } }, { status: 400 });
    }
    if (error instanceof ApiError) {
      return Response.json({ error: { code: error.code, message: error.message } }, { status: error.status });
    }
    // Never log request bodies, cookies, coordinates, or database parameter values.
    console.error('API request failed:', error instanceof Error ? error.name : 'UnknownError');
    return Response.json({ error: { code: 'INTERNAL_ERROR', message: 'Unable to complete the request.' } }, { status: 500 });
  }
}
