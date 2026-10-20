import type { RequestHandler } from './$types';
import { endpoint } from '#server/api/endpoint';
import { eq } from 'drizzle-orm';
import { user, employeeProfiles, employerProfiles, employeePreferences } from '#server/db/schema';
import { body, respond } from '#server/api/http';
import { employeeInput, employerInput } from '#server/api/validation';
import { ENABLE_LOCATION_MOCKS } from '$app/env/private';
import { ensureLocationMocks } from '#server/location-mocks';

export const PUT: RequestHandler = endpoint(async ({ db, request, identity, uid, requireRole }) => {
  if (identity.profileType === 'employee') {
    const { name, ...data } = await body(request, employeeInput);
    const profile = await db.transaction(async (tx) => {
      await tx.update(user).set({ name, updatedAt: new Date() }).where(eq(user.id, uid));
      const [result] = await tx.insert(employeeProfiles).values({ userId: uid, ...data })
        .onConflictDoUpdate({ target: employeeProfiles.userId, set: { ...data, updatedAt: new Date() } }).returning();
      await tx.insert(employeePreferences).values({ userId: uid }).onConflictDoNothing();
      return result;
    });
    return respond(profile);
  }
  requireRole('employer');
  const { name, ...data } = await body(request, employerInput);
  if (ENABLE_LOCATION_MOCKS === 'true') await ensureLocationMocks(db, data.latitude, data.longitude);
  return respond(await db.transaction(async (tx) => {
    await tx.update(user).set({ name, updatedAt: new Date() }).where(eq(user.id, uid));
    const [profile] = await tx.insert(employerProfiles).values({ userId: uid, ...data })
      .onConflictDoUpdate({ target: employerProfiles.userId, set: { ...data, updatedAt: new Date() } }).returning();
    return profile;
  }));
});
