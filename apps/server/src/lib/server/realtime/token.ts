import { createHmac, timingSafeEqual } from 'node:crypto';

export type Claims = { userId: string; conversationId?: string; participants?: string[]; exp: number };
export function signToken(claims: Claims, secret: string) {
  const payload = Buffer.from(JSON.stringify(claims)).toString('base64url');
  return `${payload}.${createHmac('sha256', secret).update(payload).digest('base64url')}`;
}
export function verifyToken(token: unknown, secret: string): Claims {
  if (typeof token !== 'string' || token.length > 4096) throw new Error('Invalid token');
  const [payload, signature, extra] = token.split('.');
  if (!payload || !signature || extra) throw new Error('Invalid token');
  const expected = createHmac('sha256', secret).update(payload).digest();
  const actual = Buffer.from(signature, 'base64url');
  if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) throw new Error('Invalid token');
  const claims = JSON.parse(Buffer.from(payload, 'base64url').toString()) as Claims;
  if (!claims.userId || !Number.isFinite(claims.exp) || claims.exp <= Date.now()) throw new Error('Expired token');
  return claims;
}
