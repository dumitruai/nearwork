import type { RequestHandler } from './$types';
import { endpoint } from '#server/api/endpoint';
import { employeePreferences } from '#server/db/schema';
import { body, respond } from '#server/api/http';
import { preferencesInput } from '#server/api/validation';
import { z } from 'zod';
import { ENABLE_LOCATION_MOCKS } from '$app/env/private';
import { ensureLocationMocks } from '#server/location-mocks';

export const PUT: RequestHandler = endpoint(async ({ db, request, uid, requireProfile }) => {
  await requireProfile('employee');
  const { point, ...data } = await body(request, preferencesInput.safeExtend({
    point: z.object({ latitude: z.number().finite().min(-90).max(90), longitude: z.number().finite().min(-180).max(180) }).strict().optional(),
  }));
  const location = data.locationSource === 'device' ? point : undefined;
  if (ENABLE_LOCATION_MOCKS === 'true' && location)
    await ensureLocationMocks(db, location.latitude, location.longitude);
  const [preferences] = await db.insert(employeePreferences).values({ userId: uid, ...data })
    .onConflictDoUpdate({ target: employeePreferences.userId, set: { ...data, updatedAt: new Date() } }).returning();
  return respond(preferences);
});
