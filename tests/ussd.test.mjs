import test from "node:test";
import assert from "node:assert/strict";
import { database } from "./helpers/services.mjs";
import { DomainError } from "../lib/errors.mjs";
import { standaloneRequest } from "../lib/cloudflare-access.mjs";
import {
  MAX_REPLY,
  MENU,
  formatNear,
  handleUssd,
  isSimulatorPhone,
  normalizePhone,
  parsePayload,
  tokenMatches,
} from "../lib/ussd-core.mjs";

const NOW = 1_800_000_000_000;
const NEAR = (n) => (BigInt(Math.round(n * 1e4)) * 10n ** 20n).toString();
const view = (o = {}) => ({
  owner_id: "alice.near",
  per_tx_cap: NEAR(0.1),
  daily_cap: NEAR(0.3),
  spent_today: NEAR(0.05),
  remaining_today: NEAR(0.25),
  available_balance: NEAR(0.85),
  day_index: 20000,
  frozen: false,
  ...o,
});

function setup({ phone = "+999000001", channel = "simulator", pocket = view() } = {}) {
  const { sql, adapter } = database();
  sql
    .prepare("INSERT INTO ussd_phones (phone,pocket_id,channel,created_at) VALUES (?,?,?,?)")
    .run(phone, "pocket.alice.near", channel, NOW);
  const reads = [];
  const readPocket = async (id) => {
    reads.push(id);
    if (pocket instanceof Error) throw pocket;
    return pocket;
  };
  const dial = (text, o = {}) =>
    handleUssd(
      { sessionId: o.sessionId || "ATUid_1", serviceCode: "*384*1#", phone: o.phone || phone, text },
      o.channel || channel,
      { db: adapter, readPocket, now: o.now || NOW },
    );
  return { sql, dial, reads };
}

test("payloads are validated and phones normalized to E.164", () => {
  assert.equal(normalizePhone("+254 712-345-678"), "+254712345678");
  assert.equal(normalizePhone("0712345678"), null);
  assert.equal(normalizePhone("+1234"), null);
  assert.ok(isSimulatorPhone("+999000001"));
  assert.ok(!isSimulatorPhone("+254712345678"));
  const ok = { sessionId: "ATUid_x", serviceCode: "*384*1#", phoneNumber: "+999000001", text: "2*bob*0.05" };
  assert.deepEqual(parsePayload(ok), { sessionId: "ATUid_x", serviceCode: "*384*1#", phone: "+999000001", text: "2*bob*0.05" });
  for (const bad of [
    { ...ok, sessionId: "" },
    { ...ok, sessionId: "a b" },
    { ...ok, phoneNumber: "nope" },
    { ...ok, text: "1;DROP" },
    { ...ok, text: "1".repeat(161) },
    { ...ok, serviceCode: "*384*<1#" },
  ])
    assert.equal(parsePayload(bad), null);
});

test("provider token comparison requires an exact, long secret", () => {
  const secret = "s".repeat(32);
  assert.ok(tokenMatches(secret, secret));
  assert.ok(!tokenMatches(secret.slice(1), secret));
  assert.ok(!tokenMatches("x".repeat(32), secret));
  assert.ok(!tokenMatches("short", "short"), "secrets under 24 chars are refused");
  assert.ok(!tokenMatches("", undefined), "missing configuration fails closed");
});

test("NEAR amounts are truncated to 4 decimals, never rounded up", () => {
  assert.equal(formatNear("999999999999999999999999"), "0.9999");
  assert.equal(formatNear(NEAR(0.1)), "0.1");
  assert.equal(formatNear("0"), "0");
  assert.equal(formatNear("x"), "Unknown");
});

test("dialing shows the menu, then Balance reads the linked pocket and ends", async () => {
  const { dial, reads, sql } = setup();
  assert.equal(await dial(""), "CON " + MENU);
  const r = await dial("1");
  assert.ok(r.startsWith("END "));
  assert.match(r, /Spendable: 0\.85 NEAR/);
  assert.match(r, /Today left: 0\.25 of 0\.3 NEAR/);
  assert.match(r, /Max per send: 0\.1 NEAR/);
  assert.doesNotMatch(r, /FROZEN/);
  assert.deepEqual(reads, ["pocket.alice.near"]);
  assert.equal(sql.prepare("SELECT COUNT(*) n FROM ussd_sessions").get().n, 0, "END clears the session");
});

test("a frozen pocket says so on Balance", async () => {
  const { dial } = setup({ pocket: view({ frozen: true }) });
  await dial("");
  assert.match(await dial("1"), /FROZEN\. Unfreeze from your main wallet\./);
});

test("unlinked numbers and wrong-channel numbers cannot reach a pocket", async () => {
  const a = setup();
  assert.match(await a.dial("", { phone: "+999000002" }), /^END This number isn't linked/);
  assert.deepEqual(a.reads, []);
  // A live-linked number dialed through the simulator channel is treated as unlinked.
  const b = setup({ phone: "+254712345678", channel: "live" });
  assert.match(await b.dial("", { channel: "simulator" }), /^END This number isn't linked/);
  assert.deepEqual(b.reads, []);
});

test("a session cannot be continued by another phone, after expiry or without starting", async () => {
  const { dial, sql } = setup();
  sql
    .prepare("INSERT INTO ussd_phones (phone,pocket_id,channel,created_at) VALUES (?,?,?,?)")
    .run("+999000009", "pocket.mallory.near", "simulator", NOW);
  await dial("");
  assert.match(await dial("1", { phone: "+999000009" }), /^END Session expired/);
  assert.match(await dial("1", { now: NOW + 181_000 }), /^END Session expired/);
  assert.match(await dial("1", { sessionId: "never-started" }), /^END Session expired/);
});

test("starting a new session removes expired ones", async () => {
  const { dial, sql } = setup();
  await dial("", { sessionId: "old" });
  await dial("", { sessionId: "new", now: NOW + 200_000 });
  const ids = sql.prepare("SELECT session_id FROM ussd_sessions").all().map((r) => r.session_id);
  assert.deepEqual(ids, ["new"]);
});

test("provider failures end the session with a plain message; unknown choices are refused", async () => {
  const { dial } = setup({ pocket: new DomainError("PROVIDER_UNAVAILABLE", "x", 503) });
  await dial("");
  assert.match(await dial("1"), /^END Your pocket can't be read right now/);
  const other = setup();
  await other.dial("");
  assert.match(await other.dial("9"), /^END Invalid choice/);
  await other.dial("", { sessionId: "s2" });
  assert.match(await other.dial("2", { sessionId: "s2" }), /^END This option is coming soon/);
});

test("every reply fits the USSD length limit", async () => {
  const { dial } = setup({ pocket: view({ frozen: true, available_balance: "9".repeat(40) }) });
  await dial("");
  const r = await dial("1");
  assert.ok(r.length <= MAX_REPLY, `reply is ${r.length} chars`);
});

test("USSD paths bypass Access but never carry an identity; other paths still require Access", async () => {
  const env = { PORTI_HOST_MODE: "cloudflare" }; // no Access config at all
  const forged = { "oai-authenticated-user-id": "attacker", "x-porti-x": "1", "Cf-Access-Jwt-Assertion": "junk" };
  for (const path of ["/api/ussd", "/api/ussd/sim"]) {
    const r = await standaloneRequest(new Request("https://porti.example" + path, { method: "POST", headers: forged }), env);
    assert.ok(r instanceof Request, path + " passes through");
    assert.equal(r.headers.get("oai-authenticated-user-id"), null);
    assert.equal(r.headers.get("x-porti-x"), null);
    assert.equal(r.headers.get("Cf-Access-Jwt-Assertion"), null);
  }
  for (const path of ["/api/ussd/sim/", "/api/ussdx", "/api/porti", "/api/ussd/../porti"]) {
    const r = await standaloneRequest(new Request("https://porti.example" + path, { headers: forged }), env);
    assert.ok(r instanceof Response && r.status >= 400, path + " stays protected");
  }
});
