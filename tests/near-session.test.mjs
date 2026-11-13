import test from "node:test";
import assert from "node:assert/strict";
import { database } from "./helpers/services.mjs";
import { nep413Bytes } from "../lib/near-identity.mjs";
import {
  CHALLENGE_TTL_MS,
  SESSION_TTL_MS,
  completeLogin,
  createLoginChallenge,
  nearSessionRequest,
  readCookie,
  revokeSession,
  sessionAccount,
  sessionCookie,
} from "../lib/near-session.mjs";

const NOW = 1_800_000_000_000;
const ORIGIN = "https://porti.example";
const ALPHABET = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
function base58(bytes) {
  let n = 0n;
  for (const b of bytes) n = n * 256n + BigInt(b);
  let s = "";
  while (n > 0n) { s = ALPHABET[Number(n % 58n)] + s; n /= 58n; }
  for (const b of bytes) { if (b === 0) s = "1" + s; else break; }
  return s;
}
async function wallet() {
  const keys = await crypto.subtle.generateKey({ name: "Ed25519" }, true, ["sign", "verify"]);
  const raw = new Uint8Array(await crypto.subtle.exportKey("raw", keys.publicKey));
  const publicKey = "ed25519:" + base58(raw);
  return {
    publicKey,
    async sign(challenge, accountId = challenge.account) {
      const nonce = Uint8Array.from(atob(challenge.nonce), (c) => c.charCodeAt(0));
      const digest = await crypto.subtle.digest("SHA-256", nep413Bytes(challenge.message, challenge.recipient, nonce));
      const sig = new Uint8Array(await crypto.subtle.sign("Ed25519", keys.privateKey, digest));
      return { accountId, publicKey, signature: btoa(String.fromCharCode(...sig)) };
    },
  };
}
const fullAccess = (...pks) => async () => ({ keys: pks.map((pk) => ({ public_key: pk, access_key: { permission: "FullAccess" } })) });
const functionCallOnly = (pk) => async () => ({ keys: [{ public_key: pk, access_key: { permission: { FunctionCall: { method_names: [] } } } }] });

test("a full-access wallet signature opens a session that identifies only that account", async () => {
  const { adapter } = database();
  const w = await wallet();
  const c = await createLoginChallenge(adapter, "alice.near", ORIGIN, NOW);
  assert.equal(c.recipient, "porti.example");
  assert.match(c.message, /alice\.near/);
  const s = await completeLogin(adapter, { challengeId: c.id, proof: await w.sign(c) }, { readAccessKeys: fullAccess(w.publicKey), now: NOW + 1000 });
  assert.equal(s.accountId, "alice.near");
  assert.match(s.token, /^[A-Za-z0-9_-]{43}$/);
  assert.equal(await sessionAccount(adapter, `x=1; porti_session=${s.token}`, NOW + 2000), "alice.near");
  assert.equal(await sessionAccount(adapter, `porti_session=${s.token}`, NOW + SESSION_TTL_MS + 1001), null, "session expires");
});

test("the session token is stored only as a hash", async () => {
  const { adapter, sql } = database();
  const w = await wallet();
  const c = await createLoginChallenge(adapter, "alice.near", ORIGIN, NOW);
  const s = await completeLogin(adapter, { challengeId: c.id, proof: await w.sign(c) }, { readAccessKeys: fullAccess(w.publicKey), now: NOW });
  const rows = sql.prepare("SELECT token_hash FROM porti_sessions").all();
  assert.equal(rows.length, 1);
  assert.notEqual(rows[0].token_hash, s.token);
  assert.match(rows[0].token_hash, /^[0-9a-f]{64}$/);
});

test("a challenge works once, expires, and is bound to its account", async () => {
  const { adapter } = database();
  const w = await wallet();
  const keys = fullAccess(w.publicKey);
  const c = await createLoginChallenge(adapter, "alice.near", ORIGIN, NOW);
  const proof = await w.sign(c);
  await completeLogin(adapter, { challengeId: c.id, proof }, { readAccessKeys: keys, now: NOW });
  await assert.rejects(completeLogin(adapter, { challengeId: c.id, proof }, { readAccessKeys: keys, now: NOW }), { code: "LOGIN_EXPIRED" }, "replay refused");
  const late = await createLoginChallenge(adapter, "alice.near", ORIGIN, NOW);
  await assert.rejects(completeLogin(adapter, { challengeId: late.id, proof: await w.sign(late) }, { readAccessKeys: keys, now: NOW + CHALLENGE_TTL_MS + 1 }), { code: "LOGIN_EXPIRED" });
  const other = await createLoginChallenge(adapter, "alice.near", ORIGIN, NOW);
  await assert.rejects(completeLogin(adapter, { challengeId: other.id, proof: await w.sign(other, "mallory.near") }, { readAccessKeys: keys, now: NOW }), { code: "LOGIN_ACCOUNT" });
  await assert.rejects(completeLogin(adapter, { challengeId: "nope", proof }, { readAccessKeys: keys, now: NOW }), { code: "LOGIN_EXPIRED" });
});

test("a valid signature from a key the account does not hold with full access is refused", async () => {
  const { adapter } = database();
  const w = await wallet();
  const stranger = await wallet();
  const c1 = await createLoginChallenge(adapter, "alice.near", ORIGIN, NOW);
  await assert.rejects(completeLogin(adapter, { challengeId: c1.id, proof: await w.sign(c1) }, { readAccessKeys: fullAccess(stranger.publicKey), now: NOW }), { code: "LOGIN_KEY" });
  const c2 = await createLoginChallenge(adapter, "alice.near", ORIGIN, NOW);
  await assert.rejects(completeLogin(adapter, { challengeId: c2.id, proof: await w.sign(c2) }, { readAccessKeys: functionCallOnly(w.publicKey), now: NOW }), { code: "LOGIN_KEY" });
});

test("a tampered message, wrong signer or signature for another site fails verification", async () => {
  const { adapter } = database();
  const w = await wallet();
  const keys = fullAccess(w.publicKey);
  const c = await createLoginChallenge(adapter, "alice.near", ORIGIN, NOW);
  const forged = await w.sign({ ...c, message: c.message + " extra" });
  await assert.rejects(completeLogin(adapter, { challengeId: c.id, proof: forged }, { readAccessKeys: keys, now: NOW }), { code: "LOGIN_SIGNATURE" });
  const c2 = await createLoginChallenge(adapter, "alice.near", ORIGIN, NOW);
  const otherSite = await w.sign({ ...c2, recipient: "evil.example" });
  await assert.rejects(completeLogin(adapter, { challengeId: c2.id, proof: otherSite }, { readAccessKeys: keys, now: NOW }), { code: "LOGIN_SIGNATURE" });
  const c3 = await createLoginChallenge(adapter, "alice.near", ORIGIN, NOW);
  const impostor = await (await wallet()).sign(c3);
  await assert.rejects(completeLogin(adapter, { challengeId: c3.id, proof: { ...impostor, publicKey: w.publicKey } }, { readAccessKeys: keys, now: NOW }), { code: "LOGIN_SIGNATURE" });
  await assert.rejects(createLoginChallenge(adapter, "not an account!", ORIGIN, NOW), { code: "INVALID_ACCOUNT" });
});

test("sign out revokes the session", async () => {
  const { adapter } = database();
  const w = await wallet();
  const c = await createLoginChallenge(adapter, "alice.near", ORIGIN, NOW);
  const s = await completeLogin(adapter, { challengeId: c.id, proof: await w.sign(c) }, { readAccessKeys: fullAccess(w.publicKey), now: NOW });
  await revokeSession(adapter, `porti_session=${s.token}`);
  assert.equal(await sessionAccount(adapter, `porti_session=${s.token}`, NOW), null);
});

test("requests carry an identity only from a valid session; forged identity headers are removed", async () => {
  const { adapter } = database();
  const w = await wallet();
  const c = await createLoginChallenge(adapter, "alice.near", ORIGIN, NOW);
  const s = await completeLogin(adapter, { challengeId: c.id, proof: await w.sign(c) }, { readAccessKeys: fullAccess(w.publicKey), now: NOW });
  const forged = { "oai-authenticated-user-id": "near:mallory.near", "oai-authenticated-user-email": "m", "x-porti-service": "1", "Cf-Access-Jwt-Assertion": "x" };
  const anon = await nearSessionRequest(new Request(ORIGIN + "/api/porti", { headers: forged }), { DB: adapter }, NOW);
  for (const h of Object.keys(forged)) assert.equal(anon.headers.get(h), null, h + " stripped");
  const bad = await nearSessionRequest(new Request(ORIGIN, { headers: { ...forged, Cookie: "porti_session=" + "A".repeat(43) } }), { DB: adapter }, NOW);
  assert.equal(bad.headers.get("oai-authenticated-user-id"), null, "unknown token gives no identity");
  const ok = await nearSessionRequest(new Request(ORIGIN, { headers: { ...forged, Cookie: "porti_session=" + s.token } }), { DB: adapter }, NOW);
  assert.equal(ok.headers.get("oai-authenticated-user-id"), "near:alice.near");
  assert.equal(ok.headers.get("x-porti-service"), null);
});

test("cookies are HttpOnly, SameSite=Lax, Secure on https and parsed strictly", () => {
  const c = sessionCookie("A".repeat(43), { secure: true });
  assert.match(c, /HttpOnly/);
  assert.match(c, /SameSite=Lax/);
  assert.match(c, /Secure/);
  assert.doesNotMatch(sessionCookie("A".repeat(43), { secure: false }), /Secure/);
  assert.equal(readCookie("porti_session=short"), null);
  assert.equal(readCookie("porti_session=" + "A".repeat(42) + "!"), null);
  assert.equal(readCookie("other=" + "A".repeat(43)), null);
});
