import type { RequestHandler } from './$types';
import { endpoint } from '#server/api/endpoint';
import { employeePreferences } from '#server/db/schema';
import { body, respond } from '#server/api/http';
import { preferencesInput } from '#server/api/validation';
import { eq } from 'drizzle-orm';
import { fail } from '#server/api/http';
import { z } from 'zod';
import { ENABLE_LOCATION_MOCKS } from '$app/env/private';
import { ensureLocationMocks } from '#server/location-mocks';

export const PUT: RequestHandler = endpoint(async ({ db, request, uid, requireProfile }) => {
  await requireProfile('employee');
  const { point, ...data } = await body(request, preferencesInput.safeExtend({
    point: z.object({ latitude: z.number().finite().min(-90).max(90), longitude: z.number().finite().min(-180).max(180), label: z.string().trim().max(160).optional() }).strict().optional(),
  }));
  const [existing] = await db.select().from(employeePreferences).where(eq(employeePreferences.userId, uid));
  if (data.locationSource === 'manual' && !point && existing?.locationSource !== 'manual')
    fail(400, 'LOCATION_REQUIRED', 'Choose a point for your manual location.');
  const savedLocation = data.locationSource === 'manual'
    ? point ? { latitude: point.latitude, longitude: point.longitude, locationLabel: point.label || null }
      : { latitude: existing!.latitude, longitude: existing!.longitude, locationLabel: existing!.locationLabel }
    : { latitude: null, longitude: null, locationLabel: null };
  const location = point;
  if (ENABLE_LOCATION_MOCKS === 'true' && location)
    await ensureLocationMocks(db, location.latitude, location.longitude);
  const [preferences] = await db.insert(employeePreferences).values({ userId: uid, ...data, ...savedLocation })
    .onConflictDoUpdate({ target: employeePreferences.userId, set: { ...data, ...savedLocation, updatedAt: new Date() } }).returning();
  return respond(preferences);
});
