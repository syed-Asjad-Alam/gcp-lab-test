import http from 'node:http';
import { timingSafeEqual } from 'node:crypto';
import { createUserStore, EmailTakenError } from './userStore.js';
import { validateUser, parseIntParam, UUID_RE } from './validate.js';
import { readJson, HttpError } from './readBody.js';

const HEADERS = {
  'Content-Type': 'application/json; charset=utf-8',
  'Content-Security-Policy': "default-src 'none'; frame-ancestors 'none'",
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
  'Cache-Control': 'no-store',
};

function send(res, status, body, extra = {}) {
  res.writeHead(status, { ...HEADERS, ...extra });
  res.end(body === undefined ? undefined : JSON.stringify(body));
}

function keyMatches(provided, expected) {
  const a = Buffer.from(provided);
  const b = Buffer.from(expected);
  return a.length === b.length && timingSafeEqual(a, b);
}

function createRateLimiter(max, windowMs) {
  const hits = new Map();
  return (ip) => {
    const now = Date.now();
    for (const [k, v] of hits) if (v.reset <= now) hits.delete(k);
    const entry = hits.get(ip) ?? { count: 0, reset: now + windowMs };
    entry.count += 1;
    hits.set(ip, entry);
    return entry.count <= max
      ? 0
      : Math.max(1, Math.ceil((entry.reset - now) / 1000));
  };
}

export function createApp({
  apiKey,
  store = createUserStore(),
  rateLimit = 100,
  rateWindowMs = 60_000,
} = {}) {
  if (!apiKey) throw new Error('apiKey is required');
  const limiter = createRateLimiter(rateLimit, rateWindowMs);

  async function handle(req, res) {
    const retryAfter = limiter(req.socket.remoteAddress ?? 'unknown');
    if (retryAfter) {
      return send(res, 429, { error: 'Too many requests' }, { 'Retry-After': String(retryAfter) });
    }

    const auth = req.headers.authorization ?? '';
    if (!auth.startsWith('Bearer ') || !keyMatches(auth.slice(7), apiKey)) {
      return send(res, 401, { error: 'Unauthorized' }, { 'WWW-Authenticate': 'Bearer' });
    }

    const url = new URL(req.url, 'http://localhost');
    const match = /^\/users(?:\/([^/]+))?\/?$/.exec(url.pathname);
    if (!match) return send(res, 404, { error: 'Not found' });
    const id = match[1];
    const method = req.method;

    if (id === undefined) {
      if (method === 'POST') {
        const parsed = validateUser(await readJson(req), { partial: false });
        if (parsed.error) return send(res, 400, { error: parsed.error });
        return send(res, 201, store.create(parsed.value));
      }
      if (method === 'GET') {
        const limit = parseIntParam(url.searchParams.get('limit'), 20, 1, 100);
        const offset = parseIntParam(url.searchParams.get('offset'), 0, 0, 1_000_000);
        if (limit === undefined || offset === undefined) {
          return send(res, 400, { error: 'limit must be 1-100 and offset a non-negative integer' });
        }
        return send(res, 200, { users: store.list(limit, offset), limit, offset });
      }
      return send(res, 405, { error: 'Method not allowed' }, { Allow: 'GET, POST' });
    }

    if (!UUID_RE.test(id)) return send(res, 404, { error: 'User not found' });

    if (method === 'GET') {
      const user = store.get(id);
      return user ? send(res, 200, user) : send(res, 404, { error: 'User not found' });
    }
    if (method === 'PUT') {
      const parsed = validateUser(await readJson(req), { partial: true });
      if (parsed.error) return send(res, 400, { error: parsed.error });
      const user = store.update(id, parsed.value);
      return user ? send(res, 200, user) : send(res, 404, { error: 'User not found' });
    }
    if (method === 'DELETE') {
      return store.remove(id) ? send(res, 204) : send(res, 404, { error: 'User not found' });
    }
    return send(res, 405, { error: 'Method not allowed' }, { Allow: 'GET, PUT, DELETE' });
  }

  return http.createServer((req, res) => {
    handle(req, res).catch((err) => {
      if (err instanceof HttpError) return send(res, err.status, { error: err.message });
      if (err instanceof EmailTakenError) return send(res, 409, { error: 'Email already in use' });
      console.error('Unhandled error:', err?.name);
      send(res, 500, { error: 'Internal server error' });
    });
  });
}
