import { DomainError } from "./errors.mjs";
export function checkOrigin(request, { service = false } = {}) {
  const origin = request.headers.get("origin"),
    site = request.headers.get("sec-fetch-site");
  if (
    site === "cross-site" ||
    (origin && origin !== new URL(request.url).origin) ||
    (!service && !origin)
  )
    throw new DomainError(
      "ORIGIN_REJECTED",
      "Use Porti from its own signed-in page.",
      403,
    );
  const type = request.headers
    .get("content-type")
    ?.split(";")[0]
    .trim()
    .toLowerCase();
  if (type !== "application/json")
    throw new DomainError("CONTENT_TYPE", "Send application/json.", 415);
}
export async function readJSON(request, maxBytes = 12000, allowArray = false) {
  const declared = request.headers.get("content-length");
  if (declared && (!/^\d+$/.test(declared) || Number(declared) > maxBytes))
    throw new DomainError("INPUT_TOO_LARGE", "Request too large.", 413);
  const reader = request.body?.getReader();
  if (!reader)
    throw new DomainError("INVALID_JSON", "A JSON object is required.");
  const chunks = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maxBytes) {
        await reader.cancel();
        throw new DomainError("INPUT_TOO_LARGE", "Request too large.", 413);
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const c of chunks) {
    bytes.set(c, offset);
    offset += c.byteLength;
  }
  let input;
  try {
    input = JSON.parse(new TextDecoder("utf-8", { fatal: true }).decode(bytes));
  } catch {
    throw new DomainError("INVALID_JSON", "Send a valid JSON object.");
  }
  if (!input || typeof input !== "object" || (!allowArray && Array.isArray(input)))
    throw new DomainError("INVALID_INPUT", "A JSON object is required.");
  return input;
}
export async function consumeLimit(
  db,
  owner,
  bucket,
  limit,
  windowMs,
  now = Date.now(),
) {
  if (!db)
    throw new DomainError(
      "STORAGE_UNAVAILABLE",
      "Request protection is unavailable. Try later.",
      503,
    );
  const start = Math.floor(now / windowMs) * windowMs,
    key = JSON.stringify([owner, bucket, start]);
  const r = await db
    .prepare(
      "INSERT INTO porti_limits (id,count,expires_at) VALUES (?,1,?) ON CONFLICT(id) DO UPDATE SET count=count+1 WHERE count<?",
    )
    .bind(key, start + windowMs, limit)
    .run();
  if (r.meta.changes !== 1) {
    const e = new DomainError(
      "RATE_LIMITED",
      "Request limit reached. Wait until the limit resets before trying again.",
      429,
    );
    e.retryAfter = Math.max(1, Math.ceil((start + windowMs - now) / 1000));
    throw e;
  }
}
export async function responseJSON(response, maxBytes = 2000000, allowArray = false) {
  try {
    return await readJSON(response, maxBytes, allowArray);
  } catch {
    throw new DomainError(
      "PROVIDER_RESPONSE",
      "The provider response was invalid or exceeded its size limit.",
      503,
    );
  }
}
