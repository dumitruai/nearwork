import { and, eq, like } from 'drizzle-orm';
import { createDatabase } from '../src/lib/server/db';
import { employerProfiles, jobs } from '../src/lib/server/db/schema';
import { ensureMockArea } from '../src/lib/server/location-mocks';
import { generateApplicants } from '../src/lib/server/generated-accounts';

if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required.');
const { db, pool } = createDatabase(process.env.DATABASE_URL);
try {
  const areas = await db.selectDistinct({ latitude: employerProfiles.latitude, longitude: employerProfiles.longitude })
    .from(employerProfiles).where(like(employerProfiles.seedKey, 'local-v1:%'));
  for (const area of areas) await ensureMockArea(db, area.latitude, area.longitude);
  const active = await db.select().from(jobs).where(and(eq(jobs.isDemo, false), eq(jobs.isActive, true)));
  if (process.env.ENABLE_APPLICANT_BOTS === 'true')
    for (const job of active) await db.transaction(tx => generateApplicants(tx, job));
  console.log(`Refreshed ${areas.length} generated areas; processed ${active.length} active employer jobs.`);
} finally { await pool.end(); }
