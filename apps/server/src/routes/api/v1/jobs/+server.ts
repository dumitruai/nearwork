import type { RequestHandler } from './$types';
import { endpoint } from '#server/api/endpoint';
import { and, eq, isNull, or, notLike, sql } from 'drizzle-orm';
import { ENABLE_LOCATION_MOCKS, ENABLE_APPLICANT_BOTS } from '$app/env/private';
import { ensureLocationMocks } from '#server/location-mocks';
import { generateApplicants } from '#server/generated-accounts';
import { z } from 'zod';
import { distanceMeters } from '../../../../../../shared/domain';
import { employeeProfiles, employerProfiles, employeePreferences, jobs, jobDecisions } from '#server/db/schema';
import { fail, body, respond } from '#server/api/http';
import { jobInput, pageInput } from '#server/api/validation';
import { discoverySample } from '#server/discovery-sample';
import { publicJob } from '#server/api/jobs';

export const POST: RequestHandler = endpoint(async ({ db, request, uid, requireProfile }) => {
  await requireProfile('employer');
  const data = await body(request, jobInput);
  const job = await db.transaction(async tx => {
    const [created] = await tx.insert(jobs).values({ ...data, employerUserId: uid }).returning();
    if (ENABLE_APPLICANT_BOTS === 'true') await generateApplicants(tx, created);
    return created;
  });
  return respond(publicJob(job), 201);
});

export const GET: RequestHandler = endpoint(async ({ db, url, uid, requireProfile }) => {
  await requireProfile('employee');
  const query = z.object({
    latitude: z.coerce.number().min(-90).max(90).optional(),
    longitude: z.coerce.number().min(-180).max(180).optional(),
    limit: pageInput.shape.limit, offset: pageInput.shape.offset,
  }).strict().parse(Object.fromEntries(url.searchParams));
  const [profile] = await db.select().from(employeeProfiles).where(eq(employeeProfiles.userId, uid));
  const [prefs] = await db.select().from(employeePreferences).where(eq(employeePreferences.userId, uid));
  if (!prefs?.locationSource)
    fail(409, 'LOCATION_REQUIRED', 'Choose your location source first.');
  if (query.latitude === undefined || query.longitude === undefined)
    fail(400, 'LOCATION_REQUIRED', 'Current coordinates are required.');
  const point = { latitude: query.latitude, longitude: query.longitude };
  const areaKey = ENABLE_LOCATION_MOCKS === 'true'
    ? await ensureLocationMocks(db, point.latitude, point.longitude) : null;
  const rows = await db.select({ job: jobs, companyName: employerProfiles.companyName, reviewedJobId: jobDecisions.jobId }).from(jobs)
    .innerJoin(employerProfiles, eq(jobs.employerUserId, employerProfiles.userId))
    .leftJoin(jobDecisions, and(eq(jobDecisions.jobId, jobs.id), eq(jobDecisions.employeeUserId, uid)))
    .where(and(eq(jobs.isActive, true),
      or(isNull(jobs.seedKey), notLike(jobs.seedKey, 'london-job-%')),
      areaKey ? undefined : or(isNull(jobs.seedKey), notLike(jobs.seedKey, 'local-v1:%')),
      sql`6371000 * 2 * asin(sqrt(least(1.0, greatest(0.0,
        power(sin(radians(${jobs.latitude} - ${point.latitude}) / 2), 2)
        + cos(radians(${point.latitude})) * cos(radians(${jobs.latitude}))
        * power(sin(radians(${jobs.longitude} - ${point.longitude}) / 2), 2)
      )))) <= ${prefs.radiusMeters}`));
  const relevant = rows.filter(({ job }) => profile.categories.includes(job.category)
    && job.availability.some(slot => profile.availability.includes(slot)))
    .map(({ job, companyName, reviewedJobId }) => ({ ...publicJob(job), companyName, reviewedJobId,
    distanceMeters: distanceMeters(point.latitude, point.longitude, job.latitude, job.longitude) }))
    .filter(job => job.distanceMeters <= prefs.radiusMeters)
    .sort((a, b) => a.distanceMeters - b.distanceMeters || a.id.localeCompare(b.id));
  // Choose the small demo sample before removing decisions, so swiping does not refill it endlessly.
  const visible = discoverySample(relevant).filter(job => !job.reviewedJobId)
    .map(({ reviewedJobId: _, ...job }) => job);
  return respond({ items: visible.slice(query.offset, query.offset + query.limit), total: visible.length });
});
