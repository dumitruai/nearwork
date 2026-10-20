import { eq } from 'drizzle-orm';
import type { RequestEvent, RequestHandler } from '@sveltejs/kit';
import { getRuntime } from '../runtime';
import { employeeProfiles, employerProfiles } from '../db/schema';
import { fail, withApiErrors } from './http';

type Runtime = ReturnType<typeof getRuntime>;
type Identity = NonNullable<Awaited<ReturnType<Runtime['auth']['api']['getSession']>>>['user'];
type PublicContext = Pick<RequestEvent, 'request' | 'url' | 'params'> & { db: Runtime['db'] };
type ProfileType = 'employee' | 'employer';
type AuthenticatedContext = PublicContext & {
  identity: Identity;
  uid: string;
  requireRole: (role: ProfileType) => void;
  requireProfile: (role: ProfileType) => Promise<void>;
};

/** Shared request boundary only; SvelteKit owns URL and HTTP method dispatch. */
export function endpoint(handler: (context: AuthenticatedContext) => Promise<Response>): RequestHandler {
  return event => withApiErrors(async () => {
    const { db, auth } = getRuntime();
    const session = await auth.api.getSession({ headers: event.request.headers });
    if (!session) fail(401, 'UNAUTHENTICATED', 'Sign in to continue.');
    const identity = session.user;
    const uid = identity.id;
    const requireRole = (role: ProfileType) => {
      if (identity.profileType !== role) fail(403, 'WRONG_PROFILE_TYPE', `Requires an ${role} account.`);
    };
    const requireProfile = async (role: ProfileType) => {
      requireRole(role);
      const table = role === 'employee' ? employeeProfiles : employerProfiles;
      const [profile] = await db.select({ userId: table.userId }).from(table).where(eq(table.userId, uid));
      if (!profile) fail(409, 'PROFILE_REQUIRED', 'Complete your profile first.');
    };
    return handler({ request: event.request, url: event.url, params: event.params,
      db, identity, uid, requireRole, requireProfile });
  });
}

/** Only endpoints explicitly using this wrapper may bypass session authentication. */
export function publicEndpoint(handler: (context: PublicContext) => Promise<Response>): RequestHandler {
  return event => withApiErrors(async () => handler({
    request: event.request, url: event.url, params: event.params, db: getRuntime().db,
  }));
}
