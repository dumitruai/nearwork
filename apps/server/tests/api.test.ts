import assert from 'node:assert/strict';
import { after, before, test } from 'node:test';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { spawn, type ChildProcess } from 'node:child_process';
import { createServer } from 'node:net';
import pg from 'pg';
import { and, eq, like, sql } from 'drizzle-orm';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { createDatabase } from '../src/lib/server/db/index';
import * as schema from '../src/lib/server/db/schema';
import { distanceMeters } from '../../shared/domain';
import { io } from 'socket.io-client';
import { createServer as createViteServer } from 'vite';

const connectionString = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL;
if (!connectionString) throw new Error('Set TEST_DATABASE_URL or DATABASE_URL to a local PostgreSQL database.');
// Every run gets a dedicated database: generated migrations explicitly reference public.
const schemaName = `api_test_${randomUUID().replaceAll('-', '')}`;
const admin = new pg.Pool({ connectionString, max: 1 });
const testUrl = new URL(connectionString);
testUrl.pathname = `/${schemaName}`;
const { db, pool } = createDatabase(testUrl.toString());
const port = await new Promise<number>((resolve, reject) => {
  const server = createServer();
  server.once('error', reject);
  server.listen(0, '127.0.0.1', () => {
    const address = server.address();
    if (!address || typeof address === 'string') return server.close(() => reject(new Error('No test port')));
    server.close(error => error ? reject(error) : resolve(address.port));
  });
});
const baseURL = `http://127.0.0.1:${port}`;
type Client = { cookie: string; id: string };
const password = 'integration-password-123';

async function request(path: string, method = 'GET', data?: unknown, client?: Client) {
  const req = new Request(`${baseURL}${path.startsWith('/api/') ? path : `/api/v1/${path}`}`, {
    // Cold Vite compilation can outlast an idle connection on CI. Each request
    // gets a fresh HTTP connection; Socket.IO reconnect is tested separately.
    method, headers: { origin: baseURL, connection: 'close', ...(client ? { cookie: client.cookie } : {}),
      ...(data !== undefined ? { 'content-type': 'application/json' } : {}) },
    body: data === undefined ? undefined : JSON.stringify(data),
  });
  const response = await fetch(req);
  const text = await response.text();
  const json = text ? JSON.parse(text) : null;
  return { status: response.status, json, headers: response.headers };
}
async function signup(profileType: 'employee' | 'employer', suffix: string): Promise<Client> {
  const result = await request('/api/auth/sign-up/email', 'POST', {
    email: `${suffix}@example.test`, password, name: suffix, profileType,
  });
  assert.equal(result.status, 200, JSON.stringify(result.json));
  const cookie = result.headers.getSetCookie().map(c => c.split(';')[0]).join('; ');
  assert.ok(cookie);
  return { cookie, id: result.json.user.id };
}
const employeeData = { name: 'Employee', bio: null,
  categories: ['hospitality', 'retail', 'delivery', 'cleaning', 'warehouse'],
  availability: ['morning', 'afternoon', 'evening', 'weekend'] };
const employerData = { name: 'Owner', companyName: 'Test Cafe', industry: 'hospitality',
  workplaceLabel: 'Camden', latitude: 51.539, longitude: -0.1426 };
const jobData = { role: 'Barista', category: 'hospitality', hourlyPayMinor: 1450, currency: 'GBP',
  weeklyHoursMin: 20, weeklyHoursMax: 30, availability: ['morning'], scheduleSummary: 'Weekday mornings',
  description: 'Help serve coffee.', areaLabel: 'Camden', latitude: 51.539, longitude: -0.1426 };
let employee: Client, employer: Client, outsider: Client, otherEmployee: Client;
let jobId: string, conversationId: string;
let httpServer: ChildProcess | undefined;

before(async () => {
  await admin.query(`CREATE DATABASE "${schemaName}"`);
  await migrate(db, { migrationsFolder: fileURLToPath(new URL('../drizzle', import.meta.url)) });
  const origin = baseURL;
  const production = process.env.NEARWORK_TEST_SERVER_MODE === 'production';
  httpServer = spawn(process.execPath, production ? ['--import', 'tsx', 'start.ts'] : [
    fileURLToPath(new URL('../../../node_modules/vite/bin/vite.js', import.meta.url)),
    'dev', '--host', '127.0.0.1', '--port', String(port), '--strictPort',
  ], {
    cwd: fileURLToPath(new URL('../', import.meta.url)), windowsHide: true,
    env: { ...process.env,
      NEARWORK_TEST_OUT_DIR: `.svelte-kit/test-runs/${schemaName}`,
      PORT: String(port), HOST: '127.0.0.1',
      DATABASE_URL: testUrl.toString(),
      REDIS_URL: process.env.REDIS_URL || 'redis://localhost:6379',
      REALTIME_SECRET: 'test-realtime-secret-longer-than-32-characters',
      BETTER_AUTH_URL: origin, BETTER_AUTH_SECRET: 'http-test-only-secret-longer-than-32-characters',
      TRUSTED_ORIGINS: `${origin},http://localhost:5173,http://localhost,https://localhost`,
      ENABLE_LOCATION_MOCKS: 'true', ENABLE_APPLICANT_BOTS: 'true', XAI_API_KEY: '' },
    stdio: 'ignore',
  });
  let ready = false;
  for (let i = 0; i < 80; i++) {
    if (httpServer.exitCode !== null) throw new Error('HTTP test server exited before readiness.');
    try {
      const response = await fetch(`http://127.0.0.1:${port}/api/v1/health`);
      if (response.status === 200) { ready = true; break; }
    } catch { /* Starting up. */ }
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  assert.ok(ready, 'HTTP server should become healthy');
  employee = await signup('employee', 'employee');
  employer = await signup('employer', 'employer');
  outsider = await signup('employer', 'outsider');
  otherEmployee = await signup('employee', 'other-employee');
});
after(async () => {
  if (httpServer && httpServer.exitCode === null) {
    await new Promise<void>(resolve => { httpServer!.once('exit', () => resolve()); httpServer!.kill(); });
  }
  await pool.end();
  // schemaName contains only a fixed prefix and generated hexadecimal UUID.
  await admin.query(`DROP DATABASE "${schemaName}"`);
  await admin.end();
});

test('unauthorized access, invalid signup type, and immutable profile type', async () => {
  assert.equal((await request('me')).status, 401);
  assert.equal((await request('/api/auth/sign-up/email', 'POST', {
    email: 'invalid@example.test', name: 'Invalid', password, profileType: 'admin',
  })).status, 400);
  assert.equal((await request('/api/auth/update-user', 'POST', { profileType: 'employer' }, employee)).status, 400);
  assert.equal((await request('me', 'GET', undefined, employee)).json.data.user.profileType, 'employee');
  assert.equal((await request('jobs', 'POST', jobData, employer)).status, 409);
});

test('both profiles, ownership, validation, and database type constraints', async () => {
  for (const client of [employee, otherEmployee]) {
    assert.equal((await request('me/profile', 'PUT', employeeData, client)).status, 200);
  }
  for (const client of [employer, outsider]) {
    assert.equal((await request('me/profile', 'PUT', employerData, client)).status, 200);
  }
  assert.equal((await request('jobs', 'POST', jobData, employee)).status, 403);
  assert.equal((await request('jobs', 'POST', { ...jobData, employerUserId: outsider.id }, employer)).status, 400);
  assert.equal((await request('jobs', 'POST', { ...jobData, weeklyHoursMax: 10 }, employer)).status, 400);
  assert.equal((await request('jobs', 'POST', { ...jobData, isDemo: true }, employer)).status, 400);
  await assert.rejects(db.insert(schema.employerProfiles).values({ userId: employee.id, ...employerData }));
  await assert.rejects(db.update(schema.user).set({ profileType: 'employer' }).where(eq(schema.user.id, employee.id)));
  await assert.rejects(db.update(schema.employeePreferences).set({ locationSource: 'other' })
    .where(eq(schema.employeePreferences.userId, employee.id)));
  const created = await request('jobs', 'POST', jobData, employer);
  assert.equal(created.status, 201);
  jobId = created.json.data.id;
  assert.equal(created.json.data.employerUserId, employer.id);
  assert.equal('mockEmployerInterested' in created.json.data, false);
  assert.equal((await request(`jobs/${jobId}`, 'GET', undefined, outsider)).status, 404);
  assert.equal((await request(`jobs/${jobId}`, 'PATCH', { isActive: false }, outsider)).status, 404);
  assert.equal((await request('employer/jobs', 'GET', undefined, outsider)).json.data.length, 0);
});

test('device discovery responds to coordinates and rejects removed London presets', async () => {
  assert.equal((await db.select().from(schema.jobs).where(like(schema.jobs.seedKey, 'london-job-%'))).length, 0);
  assert.equal((await request('jobs', 'GET', undefined, employee)).status, 409);
  assert.equal((await request('me/preferences', 'PUT', { radiusMeters: 1000, locationSource: 'demo', demoPresetKey: 'camden' }, employee)).status, 400);
  await request('me/preferences', 'PUT', { radiusMeters: 1000, locationSource: 'device' }, employee);
  const nearby = (await request('jobs?latitude=51.539&longitude=-0.1426', 'GET', undefined, employee)).json.data.items;
  assert.ok(nearby.some((j: { id: string }) => j.id === jobId));
  assert.ok(nearby.every((j: { distanceMeters: number }) => j.distanceMeters <= 1000));
  assert.equal(nearby[0].id, jobId, 'Real employer posts appear before generated jobs');
  const moved = (await request('jobs?latitude=47.01&longitude=28.86', 'GET', undefined, employee)).json.data.items;
  assert.ok(moved.length);
  assert.ok(!moved.some((j: { id: string }) => j.id === jobId));
  assert.equal((await request('jobs', 'GET', undefined, employee)).status, 400);
  assert.equal((await request('jobs?latitude=91&longitude=0', 'GET', undefined, employee)).status, 400);
  assert.ok((await request('jobs?latitude=51.539&longitude=-0.1426', 'GET', undefined, employee)).json.data.items.length);
  assert.equal(distanceMeters(0, 0, 0, 0), 0);
  assert.ok(Math.abs(distanceMeters(0, 0, 0, 1) - 111194.93) < 1);
});

test('concurrent interests are idempotent, private, and stay pending until accepted', async () => {
  const results = await Promise.all(Array.from({ length: 5 }, () =>
    request(`jobs/${jobId}/decision`, 'POST', { decision: 'interested' }, employee)));
  assert.ok(results.every(r => r.status === 200 && r.json.data.match === null));
  assert.equal((await request(`jobs/${jobId}/decision`, 'POST', { decision: 'pass' }, employee)).status, 409);
  assert.equal((await request(`jobs/${jobId}/decision`, 'POST', { decision: 'interested' }, employer)).status, 403);
  assert.equal((await request('me/interests', 'GET', undefined, otherEmployee)).json.data.length, 0);
  assert.equal((await request('employer/interests', 'GET', undefined, outsider)).json.data.length, 0);
  const pending = await request('employer/interests', 'GET', undefined, employer);
  assert.equal(pending.json.data.length, 1);
  assert.equal(pending.json.data[0].employee.userId, employee.id);
  assert.equal('email' in pending.json.data[0].employee, false);
  const discovery = await request('jobs?latitude=51.539&longitude=-0.1426', 'GET', undefined, employee);
  assert.ok(!discovery.json.data.items.some((j: { id: string }) => j.id === jobId));
});

test('acceptance requires ownership and creates exactly one match and conversation', async () => {
  const path = `jobs/${jobId}/interests/${employee.id}/accept`;
  assert.equal((await request(path, 'POST', undefined, outsider)).status, 404);
  assert.equal((await request(path, 'POST', undefined, employee)).status, 403);
  assert.equal((await request(`jobs/${jobId}/interests/${otherEmployee.id}/accept`, 'POST', undefined, employer)).status, 404);
  const results = await Promise.all(Array.from({ length: 5 }, () => request(path, 'POST', undefined, employer)));
  assert.ok(results.every(r => r.status === 200));
  assert.equal(new Set(results.map(r => r.json.data.match.id)).size, 1);
  assert.equal(new Set(results.map(r => r.json.data.conversation.id)).size, 1);
  conversationId = results[0].json.data.conversation.id;
  assert.equal((await request('me/interests', 'GET', undefined, employee)).json.data.length, 0);
  assert.equal((await request('me/matches', 'GET', undefined, employee)).json.data.length, 1);
  assert.equal((await request('me/matches', 'GET', undefined, employer)).json.data.length, 4);
  assert.equal((await request('me/matches', 'GET', undefined, outsider)).json.data.length, 0);
});

test('bodyless JSON mutations allow the Android origin but reject untrusted origins', async () => {
  const url = `${baseURL}/api/v1/jobs/${jobId}/interests/${employee.id}/accept`;
  for (const [origin, expected] of [['http://localhost', 200], ['https://localhost', 200], ['https://untrusted.example', 403]] as const) {
    const result = await fetch(url, { method: 'POST',
      headers: { cookie: employer.cookie, origin, 'Content-Type': 'application/json' } });
    assert.equal(result.status, expected);
  }
});

test('chat participant checks, retry safety, and cursor pagination', async () => {
  const path = `conversations/${conversationId}/messages`;
  assert.equal((await request(path, 'GET', undefined, outsider)).status, 404);
  assert.equal((await request(path, 'POST', { clientMessageId: randomUUID(), body: 'Intrusion' }, otherEmployee)).status, 404);
  const data = { clientMessageId: randomUUID(), body: 'Hello!' };
  const results = await Promise.all(Array.from({ length: 5 }, () => request(path, 'POST', data, employee)));
  assert.ok(results.every(r => r.status === 200));
  assert.equal(new Set(results.map(r => r.json.data.id)).size, 1);
  assert.equal((await request(path, 'POST', { ...data, body: 'Changed' }, employee)).status, 409);
  assert.equal((await request(path, 'POST', { clientMessageId: randomUUID(), body: ' ' }, employee)).status, 400);
  for (let i = 0; i < 4; i++) {
    assert.equal((await request(path, 'POST', { clientMessageId: randomUUID(), body: `Reply ${i}` }, employer)).status, 200);
  }
  let cursor: string | null = null;
  const ids: string[] = [];
  do {
    const result = await request(`${path}?limit=2${cursor ? `&before=${cursor}` : ''}`, 'GET', undefined, employee);
    assert.equal(result.status, 200);
    ids.push(...result.json.data.items.map((m: { id: string }) => m.id));
    cursor = result.json.data.nextCursor;
  } while (cursor);
  assert.equal(ids.length, 5);
  assert.equal(new Set(ids).size, 5);
  assert.equal((await request(`${path}?before=garbage`, 'GET', undefined, employee)).status, 400);
});

test('conversation lists and read receipts enforce participant and recipient access', async () => {
  const list = await request('conversations', 'GET', undefined, employee);
  assert.equal(list.status, 200);
  assert.equal(list.json.data.length, 1);
  assert.equal(list.json.data[0].id, conversationId);
  assert.equal(list.json.data[0].unreadCount, 4);
  assert.equal((await request('conversations/unread')).status, 401);
  assert.equal((await request('conversations/unread', 'GET', undefined, employee)).json.data.count, 4);
  const employerThreads = (await request('conversations?limit=100', 'GET', undefined, employer)).json.data;
  const employerUnread = employerThreads.reduce((total: number, thread: { unreadCount: number }) => total + thread.unreadCount, 0);
  assert.ok(employerUnread > 1);
  assert.equal((await request('conversations/unread', 'GET', undefined, employer)).json.data.count, employerUnread);
  assert.equal((await request('conversations/unread', 'GET', undefined, outsider)).json.data.count, 0);
  assert.equal((await request('conversations', 'GET', undefined, outsider)).json.data.length, 0);
  const path = `conversations/${conversationId}/read`;
  const history = await request(`conversations/${conversationId}/messages`, 'GET', undefined, employee);
  const incoming = history.json.data.items.filter((m: { senderUserId: string }) => m.senderUserId === employer.id);
  const own = history.json.data.items.find((m: { senderUserId: string }) => m.senderUserId === employee.id);
  const data = { messageIds: [incoming[0].id, own.id] };
  assert.equal((await request(path, 'POST', data, outsider)).status, 404);
  assert.equal((await request(path, 'POST', data, employee)).status, 200);
  assert.equal((await request(path, 'POST', data, employee)).status, 200);
  assert.equal((await request('conversations', 'GET', undefined, employee)).json.data[0].unreadCount, 3);
  assert.equal((await request('conversations/unread', 'GET', undefined, employee)).json.data.count, 3);
  assert.equal((await request('conversations', 'GET', undefined, employer)).json.data[0].unreadCount, 1);
  assert.equal((await request(path, 'POST', { messageIds: [] }, employee)).status, 400);
});

test('realtime tokens require sessions and participant authorization', async () => {
  assert.equal((await request('realtime/token')).status, 401);
  assert.equal((await request(`realtime/token?conversationId=${conversationId}`, 'GET', undefined, outsider)).status, 404);
  const token = await request(`realtime/token?conversationId=${conversationId}`, 'GET', undefined, employee);
  assert.equal(token.status, 200);
  assert.equal(typeof token.json.data.token, 'string');
  assert.ok(token.json.data.expiresAt > Date.now());
  assert.ok(token.json.data.expiresAt <= Date.now() + 5 * 60_000);
});

test('committed messages and batched receipts reach an authorized socket; reconnect restores history', async () => {
  const token = await request(`realtime/token?conversationId=${conversationId}`, 'GET', undefined, employer);
  const socket = io(baseURL, { path: '/api/socket-io/socket.io', transports: ['websocket'], autoConnect: false,
    reconnection: false, extraHeaders: { origin: baseURL }, auth: { token: token.json.data.token } });
  const next = (name: string) => new Promise<any>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Missing socket event: ${name}`)), 5000);
    socket.once(name, data => { clearTimeout(timer); resolve(data); });
  });
  try {
    const ready = next('ready'); socket.connect(); await ready;
    const incoming = next('chat');
    const sent = await request(`conversations/${conversationId}/messages`, 'POST', {
      clientMessageId: randomUUID(), body: 'Realtime integration message',
    }, employee);
    assert.equal(sent.status, 200);
    assert.equal((await incoming).data.id, sent.json.data.id);
    const receipt = next('chat');
    await request(`conversations/${conversationId}/read`, 'POST', { messageIds: [sent.json.data.id] }, employer);
    const readEvent = await receipt;
    assert.equal(readEvent.type, 'read');
    assert.equal(readEvent.data.items[0].id, sent.json.data.id);
    assert.ok(readEvent.data.items[0].readAt);
    socket.disconnect();
    const missed = await request(`conversations/${conversationId}/messages`, 'POST', {
      clientMessageId: randomUUID(), body: 'While disconnected',
    }, employee);
    const reconnected = next('ready'); socket.connect(); await reconnected;
    const history = await request(`conversations/${conversationId}/messages`, 'GET', undefined, employer);
    assert.ok(history.json.data.items.some((m: { id: string }) => m.id === missed.json.data.id));
    assert.ok(history.json.data.items.find((m: { id: string }) => m.id === sent.json.data.id).readAt);
  } finally { socket.disconnect(); }
});

test('the API server rejects unauthenticated socket upgrades without disrupting HTTP', async () => {
  const socket = io(baseURL, { path: '/api/socket-io/socket.io', transports: ['websocket'],
    reconnection: false, autoConnect: false, extraHeaders: { origin: baseURL }, auth: { token: 'invalid' } });
  try {
    const error = new Promise<Error>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Missing connection rejection')), 5000);
      socket.once('connect_error', error => { clearTimeout(timer); resolve(error); });
    });
    socket.connect();
    assert.match((await error).message, /authentication/i);
    assert.equal((await request('health')).status, 200);
  } finally { socket.disconnect(); }
});

test('the web proxy forwards HTTP and authenticated WebSocket upgrades to the same backend', async () => {
  const root = fileURLToPath(new URL('../../mobile', import.meta.url));
  const proxy = await createViteServer({
    root, configFile: `${root}/vite.config.ts`,
    server: { host: '127.0.0.1', port: 0, proxy: { '/api': { target: baseURL } } },
  });
  await proxy.listen();
  const address = proxy.httpServer!.address() as { port: number };
  const proxyURL = `http://127.0.0.1:${address.port}`;
  const token = await request('realtime/token', 'GET', undefined, employer);
  const socket = io(proxyURL, { path: '/api/socket-io/socket.io', transports: ['websocket'],
    autoConnect: false, reconnection: false, extraHeaders: { origin: baseURL }, auth: { token: token.json.data.token } });
  try {
    assert.equal((await fetch(`${proxyURL}/api/v1/health`)).status, 200);
    const ready = new Promise<void>((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('Proxy did not forward WebSocket upgrade')), 5000);
      socket.once('ready', () => { clearTimeout(timer); resolve(); });
      socket.once('connect_error', error => { clearTimeout(timer); reject(error); });
    });
    socket.connect();
    await ready;
  } finally {
    socket.disconnect();
    await proxy.close();
  }
});

test('SvelteKit dispatches methods and validates dynamic route parameters', async () => {
  assert.equal((await request('jobs/not-a-uuid', 'GET', undefined, employee)).status, 400);
  assert.equal((await request('jobs/not-a-uuid/decision', 'POST', { decision: 'pass' }, employee)).status, 400);
  assert.equal((await fetch(`${baseURL}/api/v1/jobs`, { method: 'DELETE', headers: { cookie: employer.cookie, origin: baseURL } })).status, 405);
  assert.equal((await fetch(`${baseURL}/api/v1/conversations/${conversationId}/read`,
    { headers: { cookie: employee.cookie } })).status, 405);
  assert.equal((await fetch(`${baseURL}/api/v1/missing-endpoint`, { headers: { cookie: employee.cookie } })).status, 404);
});

test('generated employers open chat; saved jobs survive location changes and deactivation', async () => {
  const [demoJob] = await db.select().from(schema.jobs).where(eq(schema.jobs.mockEmployerInterested, true));
  const result = await request(`jobs/${demoJob.id}/decision`, 'POST', { decision: 'interested' }, employee);
  assert.equal(result.json.data.match.source, 'demo');
  const saved = (await request('me/matches', 'GET', undefined, employee)).json.data;
  assert.ok(saved.find((r: { job: { id: string } }) => r.job.id === demoJob.id).conversationId);
  await request(`jobs/${jobId}`, 'PATCH', { isActive: false }, employer);
  assert.equal((await request(`jobs/${jobId}/decision`, 'POST', { decision: 'interested' }, employee)).status, 200);
  assert.equal((await request(`jobs/${jobId}/decision`, 'POST', { decision: 'interested' }, otherEmployee)).status, 409);
  assert.equal((await request(`jobs/${jobId}`, 'GET', undefined, employee)).status, 200);
  assert.equal((await request(`jobs/${jobId}`, 'GET', undefined, otherEmployee)).status, 404);
});

test('saved endpoints calculate optional distances without filtering or changing pagination', async () => {
  const created = await request('jobs', 'POST', jobData, employer);
  const id = created.json.data.id;
  await request(`jobs/${id}/decision`, 'POST', { decision: 'interested' }, employee);
  for (const route of ['me/interests', 'me/matches']) {
    const original = (await request(`${route}?limit=100`, 'GET', undefined, employee)).json.data;
    assert.ok(original.length > 0);
    assert.ok(original.every((row: any) => row.job.distanceMeters === undefined));
    const nearby = await request(`${route}?limit=100&latitude=${jobData.latitude}&longitude=${jobData.longitude}`, 'GET', undefined, employee);
    assert.equal(nearby.status, 200);
    assert.deepEqual(nearby.json.data.map((row: any) => row.job.id), original.map((row: any) => row.job.id));
    for (const row of nearby.json.data) {
      assert.equal(row.job.distanceMeters, distanceMeters(jobData.latitude, jobData.longitude, row.job.latitude, row.job.longitude));
    }
    if (route === 'me/interests') assert.equal(nearby.json.data.find((row: any) => row.job.id === id).job.distanceMeters, 0);
    const far = (await request(`${route}?limit=100&latitude=0&longitude=0`, 'GET', undefined, employee)).json.data;
    assert.deepEqual(far.map((row: any) => row.job.id), original.map((row: any) => row.job.id));
    assert.ok(far.every((row: any) => row.job.distanceMeters > 20000));
    const page = (await request(`${route}?limit=1&offset=1&latitude=0&longitude=0`, 'GET', undefined, employee)).json.data;
    assert.deepEqual(page, far.slice(1, 2));
    for (const query of ['latitude=1', 'longitude=1', 'latitude=&longitude=0', 'latitude=91&longitude=0', 'latitude=0&longitude=181', 'latitude=NaN&longitude=0']) {
      assert.equal((await request(`${route}?${query}`, 'GET', undefined, employee)).status, 400, `${route}: ${query}`);
    }
  }
  await request(`jobs/${id}`, 'PATCH', { isActive: false }, employer);
  const inactive = (await request(`me/interests?latitude=0&longitude=0&limit=100`, 'GET', undefined, employee)).json.data.find((row: any) => row.job.id === id);
  assert.equal(inactive.job.isActive, false);
  assert.ok(inactive.job.distanceMeters > 20000);
});

test('failed acceptance rolls back the match; subsequent retry succeeds', async () => {
  const created = await request('jobs', 'POST', jobData, employer);
  const id = created.json.data.id;
  await request(`jobs/${id}/decision`, 'POST', { decision: 'interested' }, employee);
  // Induce a real PostgreSQL failure after the match insert.
  await db.execute(sql.raw(`CREATE FUNCTION reject_conversation() RETURNS trigger LANGUAGE plpgsql AS $$
    BEGIN RAISE EXCEPTION 'test failure'; END $$`));
  await db.execute(sql.raw(`CREATE TRIGGER reject_conversation BEFORE INSERT ON conversations FOR EACH ROW EXECUTE FUNCTION reject_conversation()`));
  try {
    assert.equal((await request(`jobs/${id}/interests/${employee.id}/accept`, 'POST', undefined, employer)).status, 500);
    assert.equal((await db.select().from(schema.matches).where(and(eq(schema.matches.jobId, id), eq(schema.matches.employeeUserId, employee.id)))).length, 0);
  } finally {
    await db.execute(sql.raw('DROP TRIGGER reject_conversation ON conversations'));
    await db.execute(sql.raw('DROP FUNCTION reject_conversation()'));
  }
  assert.equal((await request(`jobs/${id}/interests/${employee.id}/accept`, 'POST', undefined, employer)).status, 200);
});

test('login restores session and logout invalidates it', async () => {
  const login = await request('/api/auth/sign-in/email', 'POST', { email: 'employee@example.test', password });
  assert.equal(login.status, 200);
  const client = { id: employee.id, cookie: login.headers.getSetCookie().map(c => c.split(';')[0]).join('; ') };
  assert.equal((await request('me', 'GET', undefined, client)).status, 200);
  assert.equal((await request('/api/auth/sign-out', 'POST', {}, client)).status, 200);
  assert.equal((await request('me', 'GET', undefined, client)).status, 401);
});

test('SvelteKit HTTP routing, CORS, auth cookies, and protected API', async () => {
  const target = `http://127.0.0.1:${port}`;
  const preflight = await fetch(`${target}/api/v1/me`, { method: 'OPTIONS',
    headers: { origin: 'http://localhost:5173', 'access-control-request-method': 'PUT' } });
  assert.equal(preflight.status, 204);
  assert.equal(preflight.headers.get('access-control-allow-origin'), 'http://localhost:5173');
  assert.equal(preflight.headers.get('access-control-allow-credentials'), 'true');
  assert.equal((await fetch(`${target}/api/v1/me`, { headers: { origin: 'https://evil.example' } })).status, 403);
  assert.equal((await fetch(`${target}/api/v1/me`)).status, 401);
  const login = await fetch(`${target}/api/auth/sign-in/email`, { method: 'POST',
    headers: { origin: 'http://localhost:5173', 'content-type': 'application/json' },
    body: JSON.stringify({ email: 'employee@example.test', password }) });
  assert.equal(login.status, 200, await login.text());
  const cookie = login.headers.getSetCookie().map(c => c.split(';')[0]).join('; ');
  assert.ok(cookie);
  const me = await fetch(`${target}/api/v1/me`, { headers: { cookie, origin: 'http://localhost:5173' } });
  assert.equal(me.status, 200);
  assert.equal(me.headers.get('cache-control'), 'no-store');
  assert.equal((await me.json()).data.user.id, employee.id);
});

test('device locations generate stable local jobs and retain decisions across concurrent refreshes', async () => {
  const client = await signup('employee', 'local-discovery');
  await request('me/profile', 'PUT', employeeData, client);
  await request('me/preferences', 'PUT', { radiusMeters: 1000, locationSource: 'device' }, client);
  const path = 'jobs?latitude=47.011&longitude=28.861&limit=100';
  const results = await Promise.all([request(path, 'GET', undefined, client), request(path, 'GET', undefined, client)]);
  for (const result of results) {
    assert.equal(result.status, 200);
    assert.equal(result.json.data.total, 2);
    assert.ok(result.json.data.items.every((j: { isDemo: boolean; distanceMeters: number }) => j.isDemo && j.distanceMeters < 1000));
  }
  const ids = results[0].json.data.items.map((j: { id: string }) => j.id);
  assert.deepEqual(ids, results[1].json.data.items.map((j: { id: string }) => j.id));
  await request(`jobs/${ids[0]}/decision`, 'POST', { decision: 'pass' }, client);
  assert.equal((await request(path, 'GET', undefined, client)).json.data.total, results[0].json.data.total - 1);
  const elsewhere = await request('jobs?latitude=-33.86&longitude=151.2', 'GET', undefined, client);
  assert.equal(elsewhere.json.data.total, 2);
  assert.ok(elsewhere.json.data.items.every((j: { id: string }) => !ids.includes(j.id)));
  assert.equal((await request(path, 'GET', undefined, client)).json.data.total, results[0].json.data.total - 1);
});

test('posting generates three applicants with ordinary inbox chats and automatic retry-safe replies', async () => {
  const owner = await signup('employer', 'automatic-owner');
  await request('me/profile', 'PUT', { ...employerData, latitude: -33.86, longitude: 151.2 }, owner);
  const created = await request('jobs', 'POST', { ...jobData, latitude: -33.86, longitude: 151.2 }, owner);
  assert.equal(created.status, 201);
  const chats = (await request('conversations', 'GET', undefined, owner)).json.data;
  assert.equal(chats.length, 3);
  assert.ok(chats.every((chat: { jobId: string; latestMessage: string; employeeName: string }) =>
    chat.jobId === created.json.data.id && chat.latestMessage && !/test|demo/i.test(chat.employeeName)));
  const path = `conversations/${chats[0].id}/messages`;
  assert.equal((await request(path, 'POST', { clientMessageId: randomUUID(), body: 'Hi' }, outsider)).status, 404);
  const message = { clientMessageId: randomUUID(), body: 'What shifts work for you?' };
  const replies = await Promise.all([request(path, 'POST', message, owner), request(path, 'POST', message, owner)]);
  assert.ok(replies.every(r => r.status === 200), JSON.stringify(replies));
  assert.equal(replies[0].json.data.id, replies[1].json.data.id);
  const history = (await request(path, 'GET', undefined, owner)).json.data.items;
  assert.equal(history.length, 3);
  assert.equal(history[1].senderUserId, owner.id);
  assert.ok(history[2].senderUserId.startsWith('generated-applicant:'));
  assert.equal((await request(path, 'POST', { ...message, body: 'changed' }, owner)).status, 409);
});

test('saving device location generates before discovery and generated employers reply through ordinary chat', async () => {
  const client = await signup('employee', 'automatic-employee');
  await request('me/profile', 'PUT', employeeData, client);
  const prefs = await request('me/preferences', 'PUT', { radiusMeters: 1000, locationSource: 'device',
    point: { latitude: 35.681, longitude: 139.761 } }, client);
  assert.equal(prefs.status, 200);
  assert.equal('point' in prefs.json.data, false);
  const generated = await db.select().from(schema.jobs).where(like(schema.jobs.seedKey, 'local-v1:35.6825:139.7625:%'));
  assert.equal(generated.length, 5);
  generated.sort((a, b) => Number(b.mockEmployerInterested) - Number(a.mockEmployerInterested));
  const interested = await request(`jobs/${generated[0].id}/decision`, 'POST', { decision: 'interested' }, client);
  assert.equal(interested.status, 200);
  const id = interested.json.data.conversationId;
  assert.ok(id);
  const repeat = await request(`jobs/${generated[0].id}/decision`, 'POST', { decision: 'interested' }, client);
  assert.equal(repeat.json.data.conversationId, id);
  const path = `conversations/${id}/messages`;
  const sent = { clientMessageId: randomUUID(), body: 'What hours are available?' };
  assert.equal((await request(path, 'POST', sent, client)).status, 200);
  assert.equal((await request(path, 'POST', sent, client)).status, 200);
  const history = (await request(path, 'GET', undefined, client)).json.data.items;
  assert.equal(history.length, 3);
  assert.equal(history[2].senderUserId, generated[0].employerUserId);
  assert.match(history[2].body, /schedule/i);
});

test('radius bands, cell boundaries, fixture repair, and GPS-free existing activity', async () => {
  const { ensureMockArea, mockArea } = await import('../src/lib/server/location-mocks');
  const client = await signup('employee', 'radius-recovery');
  await request('me/profile', 'PUT', employeeData, client);
  const latitude = 40.71249, longitude = -74.00751;
  async function discover(radiusMeters: number, lat = latitude) {
    await request('me/preferences', 'PUT', { radiusMeters, locationSource: 'device' }, client);
    const items: { id: string; distanceMeters: number }[] = [];
    let total = 0;
    do {
      const result = await request(`jobs?latitude=${lat}&longitude=${longitude}&limit=100&offset=${items.length}`, 'GET', undefined, client);
      assert.equal(result.status, 200, JSON.stringify(result.json));
      total = result.json.data.total; items.push(...result.json.data.items);
    } while (items.length < total);
    return items;
  }
  const small = await discover(1000), medium = await discover(5000), large = await discover(20000);
  assert.ok(small.length > 0 && medium.length > small.length && large.length > medium.length);
  assert.ok(small.every(j => medium.some(k => k.id === j.id)));
  assert.ok(medium.every(j => large.some(k => k.id === j.id)));
  assert.ok(large.every(j => j.distanceMeters <= 20000));
  const moved = await discover(20000, 40.71501);
  assert.equal(large.length, 5);
  assert.ok(moved.length <= 5);
  assert.ok(large.some(j => moved.some(k => k.id === j.id)));
  const area = mockArea(latitude, longitude);
  const fixtures = await db.select().from(schema.jobs).where(like(schema.jobs.seedKey, `${area.key}:%`));
  const pending = fixtures.find(j => !j.mockEmployerInterested)!;
  const mutual = fixtures.find(j => j.mockEmployerInterested)!;
  const interest = await request(`jobs/${pending.id}/decision`, 'POST', { decision: 'interested' }, client);
  assert.equal(interest.json.data.match, null);
  assert.ok(!interest.json.data.conversationId);
  const match = await request(`jobs/${mutual.id}/decision`, 'POST', { decision: 'interested' }, client);
  assert.ok(match.json.data.conversationId);
  const [surplus] = await db.insert(schema.jobs).values({ ...pending, id: randomUUID(), seedKey: `${area.key}:hospitality:5`, isActive: true }).returning();
  await db.update(schema.jobs).set({ latitude: 0, mockEmployerInterested: true }).where(eq(schema.jobs.id, pending.id));
  await ensureMockArea(db, latitude, longitude);
  await ensureMockArea(db, latitude, longitude);
  const [repaired] = await db.select().from(schema.jobs).where(eq(schema.jobs.id, pending.id));
  assert.equal(repaired.latitude, pending.latitude);
  assert.equal(repaired.mockEmployerInterested, false);
  const [retired] = await db.select().from(schema.jobs).where(eq(schema.jobs.id, surplus.id));
  assert.equal(retired.isActive, false);
  assert.equal((await request('jobs', 'GET', undefined, client)).status, 400);
  const interests = await request('me/interests', 'GET', undefined, client);
  assert.ok(interests.json.data.some((r: { job: { id: string } }) => r.job.id === pending.id));
  const matches = await request('me/matches', 'GET', undefined, client);
  assert.ok(matches.json.data.some((r: { job: { id: string } }) => r.job.id === mutual.id));
  assert.equal((await request('conversations', 'GET', undefined, client)).status, 200);
  assert.equal((await request('me', 'GET', undefined, client)).json.data.preferences.locationSource, 'device');
  assert.equal((await request(`jobs?latitude=${latitude}&longitude=${longitude}`, 'GET', undefined, client)).status, 200);
});
