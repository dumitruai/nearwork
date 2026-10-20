import type { RequestHandler } from './$types';
import { endpoint } from '#server/api/endpoint';
import { eq } from 'drizzle-orm';
import { employeeProfiles, employerProfiles, employeePreferences } from '#server/db/schema';
import { respond } from '#server/api/http';

export const GET: RequestHandler = endpoint(async ({ db, identity, uid }) => {
  const [employee] = await db.select().from(employeeProfiles).where(eq(employeeProfiles.userId, uid));
  const [employer] = await db.select().from(employerProfiles).where(eq(employerProfiles.userId, uid));
  const [preferences] = await db.select().from(employeePreferences).where(eq(employeePreferences.userId, uid));
  return respond({ user: identity, profile: employee ?? employer ?? null, preferences: preferences ?? null });
});
