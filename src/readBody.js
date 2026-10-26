export const MAX_BODY_BYTES = 10 * 1024;

export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

export async function readJson(req, maxBytes = MAX_BODY_BYTES) {
  const declared = Number(req.headers['content-length']);
  if (declared > maxBytes) throw new HttpError(413, 'Payload too large');
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > maxBytes) throw new HttpError(413, 'Payload too large');
    chunks.push(chunk);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    throw new HttpError(400, 'Invalid JSON');
  }
}
