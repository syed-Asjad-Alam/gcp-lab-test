import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from '../src/app.js';

const KEY = 'test-key';
let server;
let base;

before(async () => {
  server = createApp({ apiKey: KEY, rateLimit: 1000 });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${server.address().port}`;
});

after(() => new Promise((r) => server.close(r)));

async function call(method, path, body, headers = {}) {
  const res = await fetch(base + path, {
    method,
    headers: { Authorization: `Bearer ${KEY}`, 'Content-Type': 'application/json', ...headers },
    body: body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body),
  });
  const text = await res.text();
  return { status: res.status, headers: res.headers, body: text ? JSON.parse(text) : undefined };
}

const mk = (n) => ({ name: `User ${n}`, email: `${n}-${Math.random().toString(36).slice(2)}@example.com` });
const MISSING = '00000000-0000-4000-8000-000000000000';

test('POST /users creates a user and returns 201 with an id', async () => {
  const r = await call('POST', '/users', mk('a'));
  assert.equal(r.status, 201);
  assert.match(r.body.id, /^[0-9a-f-]{36}$/);
  assert.equal(r.body.name, 'User a');
});

test('GET /users/:id returns the created user', async () => {
  const c = await call('POST', '/users', mk('b'));
  const r = await call('GET', `/users/${c.body.id}`);
  assert.equal(r.status, 200);
  assert.deepEqual(r.body, c.body);
});

test('GET /users lists users and respects limit/offset', async () => {
  for (const n of ['l1', 'l2', 'l3']) await call('POST', '/users', mk(n));
  const all = await call('GET', '/users?limit=100');
  assert.ok(all.body.users.length >= 3);
  const page = await call('GET', '/users?limit=2&offset=1');
  assert.equal(page.status, 200);
  assert.equal(page.body.users.length, 2);
  assert.deepEqual(page.body.users[0], all.body.users[1]);
});

test('GET /users rejects an out-of-range limit', async () => {
  assert.equal((await call('GET', '/users?limit=0')).status, 400);
  assert.equal((await call('GET', '/users?limit=abc')).status, 400);
});

test('PUT /users/:id updates fields and the change is visible on read', async () => {
  const c = await call('POST', '/users', mk('c'));
  const u = await call('PUT', `/users/${c.body.id}`, { name: 'Renamed' });
  assert.equal(u.status, 200);
  assert.equal(u.body.name, 'Renamed');
  const r = await call('GET', `/users/${c.body.id}`);
  assert.equal(r.body.name, 'Renamed');
  assert.equal(r.body.email, c.body.email);
});

test('DELETE /users/:id returns 204 and a later GET returns 404', async () => {
  const c = await call('POST', '/users', mk('d'));
  assert.equal((await call('DELETE', `/users/${c.body.id}`)).status, 204);
  assert.equal((await call('GET', `/users/${c.body.id}`)).status, 404);
});

test('GET/PUT/DELETE on an unknown id return 404', async () => {
  assert.equal((await call('GET', `/users/${MISSING}`)).status, 404);
  assert.equal((await call('PUT', `/users/${MISSING}`, { name: 'x' })).status, 404);
  assert.equal((await call('DELETE', `/users/${MISSING}`)).status, 404);
  assert.equal((await call('GET', '/users/not-a-uuid')).status, 404);
});

test('POST with an invalid email returns 400', async () => {
  const r = await call('POST', '/users', { name: 'x', email: 'nope' });
  assert.equal(r.status, 400);
});

test('POST with invalid JSON returns 400', async () => {
  assert.equal((await call('POST', '/users', '{bad')).status, 400);
});

test('POST with a body over the size cap returns 413', async () => {
  const r = await call('POST', '/users', { name: 'x'.repeat(20000), email: 'a@b.co' });
  assert.equal(r.status, 413);
});

test('POST containing an id or other unknown field is rejected with 400', async () => {
  const r = await call('POST', '/users', { ...mk('e'), id: MISSING });
  assert.equal(r.status, 400);
  const r2 = await call('POST', '/users', { ...mk('f'), role: 'admin' });
  assert.equal(r2.status, 400);
});

test('POST with a duplicate email returns 409, also on update', async () => {
  const a = mk('g');
  await call('POST', '/users', a);
  assert.equal((await call('POST', '/users', a)).status, 409);
  const other = await call('POST', '/users', mk('h'));
  assert.equal((await call('PUT', `/users/${other.body.id}`, { email: a.email })).status, 409);
});

test('requests without a valid API key return 401', async () => {
  assert.equal((await call('GET', '/users', undefined, { Authorization: 'Bearer wrong' })).status, 401);
  assert.equal((await call('GET', '/users', undefined, { Authorization: '' })).status, 401);
});

test('responses carry security headers', async () => {
  const r = await call('GET', '/users');
  assert.equal(r.headers.get('x-content-type-options'), 'nosniff');
  assert.ok(r.headers.get('content-security-policy'));
  assert.ok(r.headers.get('strict-transport-security'));
  assert.equal(r.headers.get('x-frame-options'), 'DENY');
});

test('requests beyond the rate limit return 429', async () => {
  const s = createApp({ apiKey: KEY, rateLimit: 2 });
  await new Promise((r) => s.listen(0, '127.0.0.1', r));
  const url = `http://127.0.0.1:${s.address().port}/users`;
  const h = { Authorization: `Bearer ${KEY}` };
  try {
    assert.equal((await fetch(url, { headers: h })).status, 200);
    assert.equal((await fetch(url, { headers: h })).status, 200);
    const r = await fetch(url, { headers: h });
    assert.equal(r.status, 429);
    assert.ok(r.headers.get('retry-after'));
  } finally {
    await new Promise((r) => s.close(r));
  }
});
