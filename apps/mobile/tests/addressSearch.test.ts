import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parseAddresses, searchAddresses } from '../src/lib/addressSearch.ts';

const feature = (coordinates: unknown = [-0.127, 51.507]) => ({
  geometry: { type: 'Point', coordinates },
  properties: { name: 'Workplace', housenumber: '24', street: 'High Street', city: 'London', country: 'United Kingdom' },
});

test('converts GeoJSON longitude/latitude and formats the workplace address', () => {
  assert.deepEqual(parseAddresses({ features: [feature()] }), [{
    latitude: 51.507, longitude: -0.127, title: 'Workplace',
    address: 'Workplace, 24 High Street, London, United Kingdom',
  }]);
});

test('ignores unusable coordinates, nameless results and duplicates', () => {
  assert.equal(parseAddresses({ features: [
    null, feature([200, 51]), feature([0, NaN]), feature(['0', 51]),
    { geometry: { type: 'Point', coordinates: [0, 51] }, properties: {} },
    feature(), feature(),
  ] }).length, 1);
  assert.deepEqual(parseAddresses({ features: [] }), []);
  assert.throws(() => parseAddresses({ error: 'Unavailable' }));
});

test('encodes a submitted query, omits credentials, and forwards cancellation', async (t) => {
  const controller = new AbortController();
  t.mock.method(globalThis, 'fetch', async (url: URL, options: RequestInit) => {
    assert.equal(url.searchParams.get('q'), 'Oak & Bean, London');
    assert.equal(url.searchParams.get('limit'), '5');
    assert.equal(options.credentials, 'omit');
    assert.equal(options.signal, controller.signal);
    return Response.json({ features: [feature()] });
  });
  assert.equal((await searchAddresses(' Oak & Bean, London ', controller.signal)).length, 1);
});

test('provider failures are surfaced instead of treated as no matches', async (t) => {
  t.mock.method(globalThis, 'fetch', async () => new Response(null, { status: 429 }));
  await assert.rejects(searchAddresses('London', new AbortController().signal), /unavailable/);
});
