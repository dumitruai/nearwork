import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import pg from 'pg';

test('preset retirement resets location and preserves saved legacy jobs', async () => {
  const client = new pg.Client({ connectionString: process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL });
  await client.connect();
  try {
    await client.query('BEGIN');
    // Temporary tables shadow application tables; no development data is touched.
    await client.query(`
      CREATE TEMP TABLE employee_preferences (
        user_id text PRIMARY KEY, location_source text, demo_preset_key text,
        updated_at timestamptz DEFAULT now(),
        CONSTRAINT location_check CHECK (location_source IS NULL OR location_source IN ('device', 'demo'))
      ) ON COMMIT DROP;
      CREATE TEMP TABLE jobs (
        id text PRIMARY KEY, seed_key text, is_active boolean, updated_at timestamptz DEFAULT now()
      ) ON COMMIT DROP;
      CREATE TEMP TABLE saved_jobs (job_id text REFERENCES jobs(id)) ON COMMIT DROP;
      INSERT INTO employee_preferences (user_id, location_source, demo_preset_key)
        VALUES ('old', 'demo', 'camden'), ('current', 'device', NULL);
      INSERT INTO jobs (id, seed_key, is_active)
        VALUES ('legacy', 'london-job-1', true), ('local', 'local-v1:area:retail:1', true), ('real', NULL, true);
      INSERT INTO saved_jobs VALUES ('legacy');
    `);
    const migration = await readFile(new URL('../drizzle/0002_milky_xavin.sql', import.meta.url), 'utf8');
    await client.query(migration);
    assert.deepEqual((await client.query('SELECT user_id, location_source FROM employee_preferences ORDER BY user_id')).rows,
      [{ user_id: 'current', location_source: 'device' }, { user_id: 'old', location_source: null }]);
    assert.deepEqual((await client.query('SELECT id, is_active FROM jobs ORDER BY id')).rows,
      [{ id: 'legacy', is_active: false }, { id: 'local', is_active: true }, { id: 'real', is_active: true }]);
    assert.equal((await client.query('SELECT * FROM saved_jobs')).rows[0].job_id, 'legacy');
    await assert.rejects(client.query("UPDATE employee_preferences SET location_source = 'demo'"));
  } finally {
    await client.query('ROLLBACK');
    await client.end();
  }
});
