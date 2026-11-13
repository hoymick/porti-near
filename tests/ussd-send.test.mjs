import test from "node:test";
import assert from "node:assert/strict";
import { database } from "./helpers/services.mjs";
import { DomainError } from "../lib/errors.mjs";
import { MAX_REPLY, PIN_LOCK_MS, handleUssd, hashPin, parseAmount, pinMatches } from "../lib/ussd-core.mjs";

const NOW = 1_800_000_000_000;
const NEAR = (n) => (BigInt(Math.round(n * 1e4)) * 10n ** 20n).toString();
const view = (o = {}) => ({
  owner_id: "alice.near", per_tx_cap: NEAR(0.1), daily_cap: NEAR(0.3), spent_today: NEAR(0.05),
  remaining_today: NEAR(0.25), available_balance: NEAR(0.85), day_index: 20000, frozen: false, ...o,
});
const PIN_HASH = await hashPin("1234");

function setup({ pocket = view(), pin = PIN_HASH, result = { status: "sent", hash: "Hx7kq2PfZ9aaaa" }, freezeResult = { status: "done", hash: "FrzHash1zz" } } = {}) {
  const { sql, adapter } = database();
  sql.prepare("INSERT INTO ussd_phones (phone,pocket_id,channel,pin_hash,created_at) VALUES (?,?,?,?,?)")
    .run("+999000001", "pocket.alice.near", "simulator", pin, NOW);
  const sends = [], freezes = [];
  const users = { bob: "bob.near" };
  const deps = {
    db: adapter,
    readPocket: async () => pocket,
    resolveRecipient: async (n) => {
      const name = n.replace(/^@/, "").toLowerCase();
      if (!users[name]) throw new DomainError("USERNAME_NOT_FOUND", "x", 404);
      return { username: name, wallet: users[name] };
    },
    sendFromPocket: async (s) => { sends.push(s); if (result instanceof Error) throw result; return result; },
    freezePocket: async (f) => { freezes.push(f); if (freezeResult instanceof Error) throw freezeResult; return freezeResult; },
  };
  const dial = (text, o = {}) =>
    handleUssd({ sessionId: o.sessionId || "s1", serviceCode: "*384*1#", phone: "+999000001", text }, "simulator", { ...deps, now: o.now || NOW });
  // Walk a whole session: each step re-sends the cumulative text, like the provider.
  const session = async (steps, o = {}) => {
    const out = [await dial("", o)];
    for (let i = 1; i <= steps.length; i++) out.push(await dial(steps.slice(0, i).join("*"), o));
    return out;
  };
  return { sql, dial, session, sends, freezes, users };
}

test("amounts parse to exact yoctoNEAR with at most 4 decimals", () => {
  assert.equal(parseAmount("0.05"), NEAR(0.05));
  assert.equal(parseAmount("1"), (10n ** 24n).toString());
  assert.equal(parseAmount("0.0001"), (10n ** 20n).toString());
  for (const bad of ["0", "0.00", "0.00001", "-1", "1e3", ".5", "1.", "", "abc", "1234567"]) assert.equal(parseAmount(bad), null, bad);
});

test("PINs are salted hashes and only an exact PIN matches", async () => {
  const a = await hashPin("1234"), b = await hashPin("1234");
  assert.notEqual(a, b, "salted");
  assert.doesNotMatch(a, /1234/);
  assert.ok(await pinMatches("1234", a));
  for (const bad of ["1235", "12345", "", "abcd"]) assert.ok(!(await pinMatches(bad, a)), bad);
  assert.ok(!(await pinMatches("1234", "garbage")));
  await assert.rejects(hashPin("12"), { code: "INVALID_PIN" });
});

test("send walks recipient, amount, confirm and PIN, then sends exactly what was confirmed", async () => {
  const { session, sends, sql } = setup();
  const [, to, amount, confirm, done] = await session(["2", "@Bob", "0.05", "1234"]);
  assert.equal(to, "CON Send to @username:");
  assert.match(amount, /^CON To @bob\nbob\.near\nAmount in NEAR \(max 0\.1\):$/);
  assert.match(confirm, /^CON Send 0\.05 NEAR to @bob\?\nbob\.near\nEnter PIN to confirm\n0\. Cancel$/);
  assert.equal(done, "END Sent 0.05 NEAR to @bob.\nRef: Hx7kq2Pf");
  assert.deepEqual(sends, [{ pocketId: "pocket.alice.near", receiverId: "bob.near", amount: NEAR(0.05) }]);
  assert.equal(sql.prepare("SELECT COUNT(*) n FROM ussd_sessions").get().n, 0);
});

test("the recipient pinned at the amount screen is used even if the username moves", async () => {
  const { dial, sends, users } = setup();
  await dial(""); await dial("2"); await dial("2*bob");
  users.bob = "attacker.near";
  await dial("2*bob*0.05");
  assert.match(await dial("2*bob*0.05*1234"), /^END Sent/);
  assert.equal(sends[0].receiverId, "bob.near");
});

test("a confirmation sends once: replaying or duplicating the final request sends nothing", async () => {
  const { dial, sends } = setup();
  await dial(""); await dial("2"); await dial("2*bob"); await dial("2*bob*0.05");
  const [a, b] = await Promise.all([dial("2*bob*0.05*1234"), dial("2*bob*0.05*1234")]);
  assert.equal([a, b].filter((r) => r.startsWith("END Sent")).length, 1);
  assert.match(await dial("2*bob*0.05*1234"), /^END Session expired/);
  assert.equal(sends.length, 1);
});

test("the amount at the PIN step must be the one that was confirmed", async () => {
  const { dial, sends } = setup();
  await dial(""); await dial("2"); await dial("2*bob"); await dial("2*bob*0.05");
  assert.match(await dial("2*bob*0.09*1234"), /^END Invalid choice/);
  assert.equal(sends.length, 0);
});

test("cancel, unknown usernames, bad amounts and over-limit amounts send nothing", async () => {
  const s = setup();
  assert.match((await s.session(["2", "bob", "0.05", "0"]))[4], /^END Cancelled\. Nothing was sent\./);
  assert.match((await s.session(["2", "nobody"], { sessionId: "s2" }))[2], /^END @nobody has no verified wallet/);
  assert.match((await s.session(["2", "bob", "abc"], { sessionId: "s3" }))[3], /^END Enter an amount like 0\.05/);
  assert.match((await s.session(["2", "bob", "0.2"], { sessionId: "s4" }))[3], /^END That is over your limit of 0\.1 NEAR/);
  assert.equal(s.sends.length, 0);
});

test("the limit shown is the smallest of per-send, today left and spendable", async () => {
  const s = setup({ pocket: view({ remaining_today: NEAR(0.03) }) });
  assert.match((await s.session(["2", "bob"]))[2], /max 0\.03\)/);
  const empty = setup({ pocket: view({ remaining_today: "0" }) });
  assert.match((await empty.session(["2", "bob"]))[2], /^END Nothing left to send today/);
  const frozen = setup({ pocket: view({ frozen: true }) });
  assert.match((await frozen.session(["2"]))[1], /^END Your pocket is frozen/);
});

test("wrong PINs count down, then lock sending for 15 minutes; a right PIN resets the count", async () => {
  const s = setup();
  const attempt = (pin, sessionId, now = NOW) => s.session(["2", "bob", "0.05", pin], { sessionId, now }).then((r) => r.at(-1));
  assert.match(await attempt("1111", "a"), /^END Wrong PIN\. 2 tries left/);
  assert.match(await attempt("1234", "b"), /^END Sent/);
  assert.match(await attempt("1111", "c"), /2 tries left/, "count was reset");
  assert.match(await attempt("1111", "d"), /1 tries left/);
  assert.match(await attempt("1111", "e"), /^END Wrong PIN\. Sending is locked/);
  assert.match((await s.session(["2"], { sessionId: "f" }))[1], /^END Too many wrong PINs/);
  assert.match((await s.session(["1"], { sessionId: "g" }))[1], /^END Spendable/, "Balance still works while locked");
  assert.match(await attempt("1234", "h", NOW + PIN_LOCK_MS + 1), /^END Sent/);
  assert.equal(s.sends.length, 2);
});

test("a number without a PIN cannot send", async () => {
  const s = setup({ pin: null });
  assert.match((await s.session(["2"]))[1], /^END Set a PIN for this number/);
});

test("contract refusals, pending submissions and a busy pocket are reported plainly", async () => {
  const cases = [
    [{ status: "refused", hash: "AAAAAAAAzz", reason: "Amount exceeds remaining daily cap" }, /^END That is over today's limit\. Nothing was sent\.\nRef: AAAAAAAA$/],
    [{ status: "refused", reason: "Pocket is frozen" }, /^END Your pocket is frozen\. Nothing was sent\.$/],
    [{ status: "refused", reason: "transfer_failed" }, /refunded to your pocket/],
    [{ status: "pending", hash: "PPPPPPPPzz" }, /^END Submitted\. Check Balance in a minute to confirm\.\nRef: PPPPPPPP$/],
    [new DomainError("POCKET_BUSY", "x", 429), /^END Another request for this pocket is in progress/],
    [new DomainError("POCKET_KEY_MISSING", "x", 503), /^END This isn't available right now/],
  ];
  for (const [result, want] of cases) {
    const r = (await setup({ result }).session(["2", "bob", "0.05", "1234"])).at(-1);
    assert.match(r, want);
    assert.ok(r.length <= MAX_REPLY);
  }
});

test("send screens fit the USSD limit even with the longest account names", async () => {
  const s = setup();
  s.users.bob = "a".repeat(55) + ".near";
  for (const r of await s.session(["2", "bob", "0.05"])) {
    assert.ok(r.length <= MAX_REPLY, `${r.length}: ${r}`);
    assert.doesNotMatch(r, /\.\.\.$/, "confirm screen is never truncated");
  }
});

test("Last 3 sends lists the newest sent or submitted sends from this number only", async () => {
  const s = setup();
  assert.match((await s.session(["3"]))[1], /^END No sends yet from this number\.$/);
  const DAY = 86_400_000;
  for (const [i, amt, status] of [[0, "0.01", "sent"], [1, "0.02", "refused"], [2, "0.03", "sent"], [3, "0.04", "pending"], [4, "0.05", "sent"]])
    s.sql.prepare("INSERT INTO ussd_sends (id,phone,pocket_id,receiver_id,username,amount,status,hash,created_at) VALUES (?,?,?,?,?,?,?,?,?)")
      .run("x" + i, "+999000001", "pocket.alice.near", "bob.near", "bob", NEAR(Number(amt)), status, null, Date.UTC(2026, 10, 10) + i * DAY);
  s.sql.prepare("INSERT INTO ussd_sends (id,phone,pocket_id,receiver_id,username,amount,status,hash,created_at) VALUES (?,?,?,?,?,?,?,?,?)")
    .run("other", "+999000002", "pocket.mallory.near", "eve.near", "eve", NEAR(9), "sent", null, Date.UTC(2026, 10, 20));
  const r = (await s.session(["3"], { sessionId: "h2" }))[1];
  assert.equal(r, "END Last sends:\n0.05 NEAR @bob 14 Nov\n0.04 NEAR @bob 13 Nov (submitted)\n0.03 NEAR @bob 12 Nov");
});

test("a send is recorded with its outcome", async () => {
  const s = setup({ result: { status: "pending", hash: "PendHash" } });
  await s.session(["2", "bob", "0.05", "1234"]);
  const rows = s.sql.prepare("SELECT phone,receiver_id,username,amount,status,hash FROM ussd_sends").all();
  assert.deepEqual(rows.map((r) => ({ ...r })), [{ phone: "+999000001", receiver_id: "bob.near", username: "bob", amount: NEAR(0.05), status: "pending", hash: "PendHash" }]);
  assert.match((await s.session(["3"], { sessionId: "h" }))[1], /0\.05 NEAR @bob .* \(submitted\)/);
});

test("Freeze asks once, needs no PIN, and calls freeze on the linked pocket", async () => {
  const s = setup({ pin: null });
  const [, ask, done] = await s.session(["4", "1"]);
  assert.match(ask, /^CON Freeze your pocket\?\n.*\n1\. Freeze now\n0\. Cancel$/);
  assert.equal(done, "END Pocket frozen. Nothing can be sent until you unfreeze it from your main wallet.\nRef: FrzHash1");
  assert.deepEqual(s.freezes, [{ pocketId: "pocket.alice.near" }]);
});

test("Freeze can be cancelled, works while PIN-locked, and is not repeated", async () => {
  const s = setup();
  assert.match((await s.session(["4", "0"]))[2], /^END Cancelled\. Your pocket was not frozen\./);
  s.sql.prepare("UPDATE ussd_phones SET locked_until=?").run(NOW + 60_000);
  await s.dial("", { sessionId: "f2" }); await s.dial("4", { sessionId: "f2" });
  const [a, b] = await Promise.all([s.dial("4*1", { sessionId: "f2" }), s.dial("4*1", { sessionId: "f2" })]);
  assert.equal([a, b].filter((r) => r.startsWith("END Pocket frozen")).length, 1);
  assert.equal(s.freezes.length, 1);
  const frozen = setup({ pocket: view({ frozen: true }) });
  assert.match((await frozen.session(["4"]))[1], /^END Your pocket is already frozen/);
  assert.equal(frozen.freezes.length, 0);
});

test("Freeze reports refused, pending and unavailable outcomes plainly", async () => {
  for (const [freezeResult, want] of [
    [{ status: "refused", hash: "RRRRRRRRzz", reason: "x" }, /^END The pocket refused to freeze\. Freeze it from your main wallet\.\nRef: RRRRRRRR$/],
    [{ status: "pending", hash: "PPPPPPPPzz" }, /^END Freeze submitted\. Check Balance in a minute/],
    [new DomainError("POCKET_KEY_MISSING", "x", 503), /^END This isn't available right now\. Nothing was changed\./],
  ]) {
    const r = (await setup({ freezeResult }).session(["4", "1"])).at(-1);
    assert.match(r, want);
    assert.ok(r.length <= MAX_REPLY);
  }
});
