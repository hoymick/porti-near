// Sign in with a NEAR wallet. The wallet signs a one-time NEP-413 message (no
// gas, no transaction); the server checks the signature AND that the signing
// key is a current full-access key of the claimed account, then issues an
// HttpOnly session cookie. Identity headers are only ever set from a valid
// session; anything a client sends in those headers is stripped first.
import { verifyNearMessage } from "./near-identity.mjs";
import { nearAccountOK } from "./near-core.mjs";
import { DomainError } from "./errors.mjs";

export const SESSION_COOKIE = "porti_session";
export const CHALLENGE_TTL_MS = 5 * 60_000;
export const SESSION_TTL_MS = 7 * 24 * 60 * 60_000;
const IDENTITY_PREFIXES = ["oai-", "x-porti-"];

const b64 = (bytes) => btoa(String.fromCharCode(...bytes));
const b64url = (bytes) => b64(bytes).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

export async function hashToken(token) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(token));
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

export function readCookie(header, name = SESSION_COOKIE) {
  if (typeof header !== "string" || header.length > 8192) return null;
  for (const part of header.split(";")) {
    const i = part.indexOf("=");
    if (i > 0 && part.slice(0, i).trim() === name) {
      const v = part.slice(i + 1).trim();
      return /^[A-Za-z0-9_-]{43}$/.test(v) ? v : null;
    }
  }
  return null;
}

export function sessionCookie(token, { secure, maxAgeMs = SESSION_TTL_MS }) {
  return `${SESSION_COOKIE}=${token}; Path=/; HttpOnly; SameSite=Lax; Max-Age=${Math.floor(maxAgeMs / 1000)}${secure ? "; Secure" : ""}`;
}
export function clearSessionCookie({ secure }) {
  return `${SESSION_COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure ? "; Secure" : ""}`;
}

/** Step 1: a one-time message for this account, bound to this site's host. */
export async function createLoginChallenge(db, account, origin, now = Date.now()) {
  if (!nearAccountOK(account))
    throw new DomainError("INVALID_ACCOUNT", "Choose a NEAR mainnet account in your wallet.");
  const nonce = b64(crypto.getRandomValues(new Uint8Array(32)));
  const expiresAt = now + CHALLENGE_TTL_MS;
  const recipient = new URL(origin).host;
  const challenge = {
    id: crypto.randomUUID(),
    account,
    nonce,
    nonceMode: "server-nonce",
    recipient,
    expiresAt,
    message: `Sign in to Porti as ${account}.\nSite: ${recipient}\nNetwork: NEAR mainnet\nExpires: ${new Date(expiresAt).toISOString()}\nThis only proves you control this wallet. It sends no funds and costs no gas.`,
  };
  await db.prepare("DELETE FROM auth_challenges WHERE expires_at < ?").bind(now).run();
  await db
    .prepare("INSERT INTO auth_challenges (id,account,nonce,recipient,message,expires_at,used) VALUES (?,?,?,?,?,?,0)")
    .bind(challenge.id, account, nonce, recipient, challenge.message, expiresAt)
    .run();
  return challenge;
}

/**
 * Step 2: verify the signed message and open a session.
 * @param deps.readAccessKeys(account) -> { keys: [{ public_key, access_key: { permission } }] } from mainnet
 */
export async function completeLogin(db, { challengeId, proof }, { readAccessKeys, now = Date.now() }) {
  if (typeof challengeId !== "string" || challengeId.length > 64 || !proof || typeof proof !== "object")
    throw new DomainError("LOGIN_INVALID", "Start sign-in again from your wallet.");
  const c = await db
    .prepare("SELECT id,account,nonce,recipient,message,expires_at AS expiresAt,used FROM auth_challenges WHERE id=?")
    .bind(challengeId)
    .first();
  if (!c || c.used || c.expiresAt < now)
    throw new DomainError("LOGIN_EXPIRED", "This sign-in request expired or was already used. Try again.", 401);
  if (proof.accountId !== c.account)
    throw new DomainError("LOGIN_ACCOUNT", "The wallet signed for a different account.", 401);
  const challenge = { account: c.account, nonce: c.nonce, nonceMode: "server-nonce", recipient: c.recipient, message: c.message };
  if (!(await verifyNearMessage(challenge, proof)))
    throw new DomainError("LOGIN_SIGNATURE", "The wallet signature did not verify.", 401);
  const keys = await readAccessKeys(c.account);
  if (!keys?.keys?.some((k) => k.public_key === proof.publicKey && k.access_key?.permission === "FullAccess"))
    throw new DomainError("LOGIN_KEY", "Sign in with a current full-access key for this account.", 401);
  // Single use: only the first verifier to flip `used` gets a session.
  const claimed = await db.prepare("UPDATE auth_challenges SET used=1 WHERE id=? AND used=0").bind(c.id).run();
  if (claimed.meta?.changes !== 1)
    throw new DomainError("LOGIN_EXPIRED", "This sign-in request was already used. Try again.", 401);
  const token = b64url(crypto.getRandomValues(new Uint8Array(32)));
  const expiresAt = now + SESSION_TTL_MS;
  await db.prepare("DELETE FROM porti_sessions WHERE expires_at < ?").bind(now).run();
  await db
    .prepare("INSERT INTO porti_sessions (token_hash,account_id,created_at,expires_at) VALUES (?,?,?,?)")
    .bind(await hashToken(token), c.account, now, expiresAt)
    .run();
  return { token, accountId: c.account, expiresAt };
}

export async function sessionAccount(db, cookieHeader, now = Date.now()) {
  const token = readCookie(cookieHeader);
  if (!token || !db) return null;
  const row = await db
    .prepare("SELECT account_id AS accountId FROM porti_sessions WHERE token_hash=? AND expires_at>?")
    .bind(await hashToken(token), now)
    .first();
  return row?.accountId && nearAccountOK(row.accountId) ? row.accountId : null;
}

export async function revokeSession(db, cookieHeader) {
  const token = readCookie(cookieHeader);
  if (token) await db.prepare("DELETE FROM porti_sessions WHERE token_hash=?").bind(await hashToken(token)).run();
}

export function stripIdentity(request) {
  const headers = new Headers(request.headers);
  for (const name of [...headers.keys()])
    if (IDENTITY_PREFIXES.some((p) => name.startsWith(p))) headers.delete(name);
  headers.delete("Cf-Access-Jwt-Assertion");
  return headers;
}

/** Worker entry: identity comes only from a valid NEAR session. */
export async function nearSessionRequest(request, env, now = Date.now()) {
  const headers = stripIdentity(request);
  const account = await sessionAccount(env.DB, request.headers.get("Cookie"), now).catch(() => null);
  if (account) {
    headers.set("oai-authenticated-user-id", "near:" + account);
    headers.set("oai-authenticated-user-email", account);
  }
  return new Request(request, { headers });
}
