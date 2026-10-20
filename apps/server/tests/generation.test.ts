import assert from 'node:assert/strict';
import { test } from 'node:test';
import { distanceMeters } from '../../shared/domain';
import { localMockJobs, mockArea, nearbyMockAreas } from '../src/lib/server/location-mocks';
import { applicantReply } from '../src/lib/server/applicant-reply';

test('five local jobs cover all categories, both interest outcomes and three distance bands', () => {
  for (const [lat, lon] of [[47.01, 28.86], [-33.86, 151.2], [0, 0], [90, 180], [-90, -180], [0, 179.999]]) {
    const jobs = localMockJobs(lat, lon);
    assert.equal(jobs.length, 5);
    assert.equal(new Set(jobs.map(j => j.category)).size, 5);
    for (const [min, max] of [[0, 1000], [1000, 5000], [5000, 20000]]) {
      const band = jobs.filter(j => { const d = distanceMeters(lat, lon, j.latitude, j.longitude); return d >= min && d < max; });
      assert.equal(band.length, min === 5000 ? 1 : 2);
      if (min < 5000) assert.deepEqual(new Set(band.map(j => j.mockEmployerInterested)), new Set([true, false]));
    }
    assert.ok(nearbyMockAreas(lat, lon).length <= 9);
    assert.ok(jobs.every(j => Math.abs(j.latitude) <= 90 && Math.abs(j.longitude) <= 180));
    assert.deepEqual(jobs, localMockJobs(lat, lon));
  }
  assert.equal(mockArea(0, 180).key, mockArea(0, -180).key);
  assert.equal(mockArea(47.011, 28.861).key, mockArea(47.0111, 28.8611).key);
  assert.notEqual(mockArea(47.01, 28.86).key, mockArea(48.85, 2.35).key);
});

test('Grok replies use bounded context, no storage, and graceful fallback', async () => {
  const context = { role: 'Barista', schedule: 'Mornings', history: [{ role: 'user' as const, content: 'When can you start?' }] };
  const offline = await applicantReply(context, {});
  assert.equal(offline.provider, 'scripted');
  const transport: typeof fetch = async (_url, init) => {
    const request = JSON.parse(init?.body as string);
    assert.equal(request.store, false);
    assert.equal(request.model, 'test-model');
    assert.equal(request.tools, undefined);
    return new Response(JSON.stringify({ output: [{ type: 'message', content: [{ type: 'output_text', text: 'I could start next week in this test.' }] }] }));
  };
  const reply = await applicantReply(context, { key: 'test-key', model: 'test-model' }, transport);
  assert.equal(reply.provider, 'grok');
  assert.equal(reply.body, 'I could start next week in this test.');
  assert.equal((await applicantReply(context, { key: 'test-key' }, async () => new Response('', { status: 429 }))).provider, 'scripted');
  assert.equal((await applicantReply(context, { key: 'test-key' }, async () => { throw new Error('network'); })).provider, 'scripted');
});

 test('discovery keeps all real jobs ahead of at most five radius-banded demos', async () => {
  const { discoverySample } = await import('../src/lib/server/discovery-sample');
  const demos = Array.from({ length: 90 }, (_, i) => ({ id: `demo-${i}`, isDemo: true,
    distanceMeters: i < 30 ? 200 + i : i < 60 ? 2500 + i : 12000 + i }));
  const real = Array.from({ length: 8 }, (_, i) => ({ id: `real-${i}`, isDemo: false, distanceMeters: 19000 + i }));
  const result = discoverySample([...demos, ...real]);
  assert.deepEqual(result.slice(0, 8), real);
  assert.equal(result.length, 13);
  const small = discoverySample(demos.filter(j => j.distanceMeters <= 1000));
  const medium = discoverySample(demos.filter(j => j.distanceMeters <= 5000));
  assert.equal(small.length, 2);
  assert.equal(medium.length, 4);
  assert.ok(small.every(j => medium.includes(j)));
  assert.ok(medium.every(j => result.includes(j)));
  assert.deepEqual(result, discoverySample([...real, ...demos].reverse()));
});
