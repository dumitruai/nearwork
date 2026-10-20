import { z } from 'zod';
import { availability, categories } from '../../../../../shared/domain';

export const nonempty = (max: number) => z.string().trim().min(1).max(max);
const latitude = z.number().finite().min(-90).max(90);
const longitude = z.number().finite().min(-180).max(180);
const slots = z.array(z.enum(availability)).min(1).max(4).transform(v => [...new Set(v)]);
export const employeeInput = z.object({
  name: nonempty(80), bio: z.string().trim().max(500).nullable().default(null),
  categories: z.array(z.enum(categories)).min(1).max(5).transform(v => [...new Set(v)]),
  availability: slots,
}).strict();
export const employerInput = z.object({
  name: nonempty(80), companyName: nonempty(160), industry: nonempty(100),
  workplaceLabel: nonempty(160), latitude, longitude,
}).strict();
export const preferencesInput = z.object({
  radiusMeters: z.union([z.literal(1000), z.literal(5000), z.literal(10000), z.literal(20000)]),
  locationSource: z.literal('device').nullable(),
}).strict();
export const jobInput = z.object({
  role: nonempty(160), category: z.enum(categories), hourlyPayMinor: z.number().int().positive().max(2147483647),
  currency: z.literal('GBP').default('GBP'), weeklyHoursMin: z.number().int().min(1).max(168),
  weeklyHoursMax: z.number().int().min(1).max(168), availability: slots,
  scheduleSummary: nonempty(500), description: nonempty(10000), areaLabel: nonempty(160),
  latitude, longitude,
}).strict().refine(v => v.weeklyHoursMin <= v.weeklyHoursMax, { message: 'Minimum hours cannot exceed maximum.' });
export const pageInput = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(30),
  offset: z.coerce.number().int().min(0).max(100000).default(0),
});
const queryCoordinate = (min: number, max: number) => z.string().trim().min(1)
  .transform(Number).pipe(z.number().finite().min(min).max(max)).optional();
export const savedPageInput = pageInput.extend({
  latitude: queryCoordinate(-90, 90),
  longitude: queryCoordinate(-180, 180),
}).refine(value => (value.latitude === undefined) === (value.longitude === undefined),
  { message: 'Provide latitude and longitude together.' });
export const cursorInput = z.object({ createdAt: z.iso.datetime(), id: z.uuid() });
