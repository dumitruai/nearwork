import { availability, categories } from '../../../../shared/domain';
import { and, notInArray, sql, like } from 'drizzle-orm';
import type { Database } from './db';
import { employerProfiles, jobs, user } from './db/schema';

const roles = ['Café assistant', 'Shop assistant', 'Delivery rider', 'Office cleaner', 'Warehouse assistant'];
const companies = ['Neighbourhood Café', 'Corner Store', 'Local Delivery', 'Bright Spaces', 'Community Warehouse'];

/** A coarse, deterministic area: never persist the requesting device's exact position. */
export function mockArea(latitude: number, longitude: number) {
  const lat = Math.max(-89.9975, Math.min(89.9975, Math.floor(latitude / .005) * .005 + .0025));
  const normalizedLongitude = ((longitude + 180) % 360 + 360) % 360 - 180;
  const lon = Math.floor(normalizedLongitude / .005) * .005 + .0025;
  return { key: `local-v1:${lat.toFixed(4)}:${lon.toFixed(4)}`, latitude: lat, longitude: lon };
}

export function localMockJobs(latitude: number, longitude: number) {
  const area = mockArea(latitude, longitude);
  return categories.map((category, sector) => {
    const variant = sector;
    const angle = (sector * 2 + variant) * Math.PI / 5;
    const angularDistance = ([250, 250, 3000, 3000, 12000, 12000][variant]) / 6371000;
    const lat = area.latitude * Math.PI / 180;
    const lon = area.longitude * Math.PI / 180;
    const destinationLat = Math.asin(Math.sin(lat) * Math.cos(angularDistance)
      + Math.cos(lat) * Math.sin(angularDistance) * Math.cos(angle));
    const destinationLon = lon + Math.atan2(Math.sin(angle) * Math.sin(angularDistance) * Math.cos(lat),
      Math.cos(angularDistance) - Math.sin(lat) * Math.sin(destinationLat));
    return {
      seedKey: `${area.key}:${category}:${variant}`,
      employerUserId: `${area.key}:${category}`,
      role: roles[sector], category, hourlyPayMinor: 1300 + sector * 50 + variant * 75,
      currency: 'GBP', weeklyHoursMin: 16 + (variant % 2) * 8, weeklyHoursMax: 32,
      availability: [...availability], scheduleSummary: variant ? 'Flexible afternoon and weekend rota' : 'Flexible morning and evening rota',
      description: [
        'Join a friendly neighbourhood café team. Prepare drinks, welcome customers, and keep the counter running smoothly. Training provided.',
        'Help customers find what they need, keep shelves stocked, and support a welcoming local shop. Training provided.',
        'Help a local team deliver orders efficiently. Clear routes, flexible shifts, and support from the dispatch team.',
        'Keep local workplaces clean and welcoming. Work with a supportive team using provided equipment and clear routines.',
        'Help receive, organise, and prepare orders with a local warehouse team. Practical training and a regular rota provided.',
      ][sector],
      areaLabel: `Nearby · ${area.latitude.toFixed(3)}, ${area.longitude.toFixed(3)}`,
      latitude: destinationLat * 180 / Math.PI,
      longitude: ((destinationLon * 180 / Math.PI + 180) % 360 + 360) % 360 - 180,
      isDemo: true, mockEmployerInterested: variant % 2 === 0, isActive: true,
    };
  });
}

/** Database lock and unique seed keys make simultaneous first visits retry-safe. */
export async function ensureMockArea(db: Database, latitude: number, longitude: number) {
  const area = mockArea(latitude, longitude);
  const listings = localMockJobs(latitude, longitude);
  await db.transaction(async tx => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${area.key}))`);
    const existing = await tx.select().from(jobs).where(like(jobs.seedKey, `${area.key}:%`));
    const retainedKeys = listings.map(listing => listing.seedKey);
    await tx.update(jobs).set({ isActive: false }).where(and(
      like(jobs.seedKey, `${area.key}:%`), notInArray(jobs.seedKey, retainedKeys)));
    if (listings.every(listing => existing.some(row => row.seedKey === listing.seedKey
      && row.isActive && row.description === listing.description && row.latitude === listing.latitude
      && row.longitude === listing.longitude && row.mockEmployerInterested === listing.mockEmployerInterested))) return;
    for (let i = 0; i < categories.length; i++) {
      const id = `${area.key}:${categories[i]}`;
      const companyName = companies[i];
      await tx.insert(user).values({ id, name: companyName,
        email: `${id}@mock.nearwork.invalid`, profileType: 'employer' })
        .onConflictDoUpdate({ target: user.id, set: { name: companyName } });
      await tx.insert(employerProfiles).values({
        userId: id, seedKey: id, companyName, industry: categories[i],
        workplaceLabel: listings[0].areaLabel, latitude: area.latitude, longitude: area.longitude,
      }).onConflictDoUpdate({ target: employerProfiles.userId, set: { companyName, workplaceLabel: listings[0].areaLabel } });
    }
    await tx.insert(jobs).values(listings).onConflictDoUpdate({ target: jobs.seedKey,
      set: { isActive: true, description: sql`excluded.description`, areaLabel: sql`excluded.area_label`, latitude: sql`excluded.latitude`, longitude: sql`excluded.longitude`, mockEmployerInterested: sql`excluded.mock_employer_interested` } });
  });
  return area.key;
}

/** At most nine cells per request; distance filtering also includes previously generated cells. */
export function nearbyMockAreas(latitude: number, longitude: number) {
  const center = mockArea(latitude, longitude);
  const areas = new Map<string, ReturnType<typeof mockArea>>();
  for (const dy of [-1, 0, 1]) for (const dx of [-1, 0, 1]) {
    const area = mockArea(Math.max(-90, Math.min(90, center.latitude + dy * .005)), center.longitude + dx * .005);
    areas.set(area.key, area);
  }
  return [...areas.values()].sort((a, b) => a.key.localeCompare(b.key));
}

export async function ensureLocationMocks(db: Database, latitude: number, longitude: number) {
  for (const area of nearbyMockAreas(latitude, longitude)) await ensureMockArea(db, area.latitude, area.longitude);
  return mockArea(latitude, longitude).key;
}
