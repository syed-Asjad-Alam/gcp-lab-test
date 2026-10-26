const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const ALLOWED = ['name', 'email'];

export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Returns { value } with only editable fields, or { error } with a message.
export function validateUser(body, { partial }) {
  if (body === null || typeof body !== 'object' || Array.isArray(body)) {
    return { error: 'Body must be a JSON object' };
  }
  for (const key of Object.keys(body)) {
    if (!ALLOWED.includes(key)) return { error: `Unknown field: ${key}` };
  }
  const value = {};
  if (body.name !== undefined || !partial) {
    if (typeof body.name !== 'string' || body.name.trim() === '' || body.name.length > 100) {
      return { error: 'name must be a non-empty string of at most 100 characters' };
    }
    value.name = body.name.trim();
  }
  if (body.email !== undefined || !partial) {
    if (typeof body.email !== 'string' || body.email.length > 254 || !EMAIL_RE.test(body.email)) {
      return { error: 'email must be a valid email address' };
    }
    value.email = body.email.toLowerCase();
  }
  if (partial && Object.keys(value).length === 0) {
    return { error: 'Provide at least one of: name, email' };
  }
  return { value };
}

// Parses a non-negative integer query value within [min, max], or returns fallback.
export function parseIntParam(raw, fallback, min, max) {
  if (raw === null) return fallback;
  if (!/^\d+$/.test(raw)) return undefined;
  const n = Number(raw);
  return n < min || n > max ? undefined : n;
}
