import type { jobs } from '../db/schema';
import { distanceMeters } from '../../../../../shared/domain';

export function publicJobWithDistance(job: typeof jobs.$inferSelect, point: { latitude?: number; longitude?: number }) {
  return { ...publicJob(job), ...(point.latitude !== undefined && point.longitude !== undefined
    ? { distanceMeters: distanceMeters(point.latitude, point.longitude, job.latitude, job.longitude) } : {}) };
}

// Keep internal demo response rules out of API responses.
export function publicJob(job: typeof jobs.$inferSelect) {
  const { mockEmployerInterested: _, seedKey: __, ...visible } = job;
  return visible;
}
