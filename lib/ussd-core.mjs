// Porti Pocket USSD state machine. Pure: storage and chain reads are injected.
// Africa's Talking posts sessionId, serviceCode, phoneNumber and the cumulative
// `text` ("1*2*..."); replies start with CON (keep session) or END (close it).
import { DomainError } from "./errors.mjs";
import { decimal } from "./near-core.mjs";

export const SIM_PREFIX = "+999";
export const SESSION_TTL_MS = 180_000;
export const MAX_REPLY = 182;
export const MENU =
  "Porti Pocket\n1. Balance\n2. Send to @username\n3. Last 3 sends\n4. Freeze pocket";

export function normalizePhone(value) {
  if (typeof value !== "string") return null;
  const m = /^\+?([1-9]\d{7,14})$/.exec(value.replace(/[\s()-]/g, ""));
  return m ? "+" + m[1] : null;
}
export const isSimulatorPhone = (phone) =>
  typeof phone === "string" && phone.startsWith(SIM_PREFIX);

export function parsePayload(input) {
  const sessionId = String(input?.sessionId ?? "");
  const serviceCode = String(input?.serviceCode ?? "");
  const phone = normalizePhone(String(input?.phoneNumber ?? ""));
  const text = String(input?.text ?? "");
  if (
    !/^[A-Za-z0-9_-]{1,100}$/.test(sessionId) ||
    !phone ||
    serviceCode.length > 20 ||
    !/^[0-9*#]*$/.test(serviceCode) ||
    text.length > 160 ||
    !/^[A-Za-z0-9_*#@.]*$/.test(text)
  )
    return null;
  return { sessionId, serviceCode, phone, text };
}

export const steps = (text) => (text === "" ? [] : text.split("*"));

/** Constant-time comparison for the provider callback token. */
export function tokenMatches(given, expected) {
  if (typeof given !== "string" || typeof expected !== "string" || expected.length < 24)
    return false;
  const a = new TextEncoder().encode(given),
    b = new TextEncoder().encode(expected);
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a[i] ^ b[i];
  return diff === 0;
}

/** NEAR with at most 4 decimals, truncated so a balance is never overstated. */
export function formatNear(yocto) {
  const s = decimal(yocto, 24);
  if (s === "Unknown") return s;
  const [whole, frac = ""] = s.split(".");
  const f = frac.slice(0, 4).replace(/0+$/, "");
  return whole + (f ? "." + f : "");
}

const fit = (s) => (s.length <= MAX_REPLY ? s : s.slice(0, MAX_REPLY - 3) + "...");
export const con = (s) => fit("CON " + s);
export const end = (s) => fit("END " + s);

export function balanceText(view) {
  return (
    `Spendable: ${formatNear(view.available_balance)} NEAR\n` +
    `Today left: ${formatNear(view.remaining_today)} of ${formatNear(view.daily_cap)} NEAR\n` +
    `Max per send: ${formatNear(view.per_tx_cap)} NEAR` +
    (view.frozen ? "\nFROZEN. Unfreeze from your main wallet." : "")
  );
}

/** "0.05" -> yoctoNEAR string. At most 4 decimals; null if not a positive amount. */
export function parseAmount(text) {
  const m = /^(\d{1,6})(?:\.(\d{1,4}))?$/.exec(String(text ?? ""));
  if (!m) return null;
  const yocto = BigInt(m[1]) * 10n ** 24n + BigInt((m[2] || "").padEnd(4, "0")) * 10n ** 20n;
  return yocto > 0n ? yocto.toString() : null;
}

// PINs: PBKDF2-SHA256 with a per-phone salt. A 4-digit PIN is weak on its own,
// so the real protection is the lockout: 3 wrong tries lock sending for 15 min.
export const PIN_MAX_FAILURES = 3;
export const PIN_LOCK_MS = 15 * 60_000;
const PIN_ITERATIONS = 100_000;
const b64 = (bytes) => btoa(String.fromCharCode(...bytes));
const unb64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
async function pbkdf2(pin, salt, iterations) {
  const key = await crypto.subtle.importKey("raw", new TextEncoder().encode(pin), "PBKDF2", false, ["deriveBits"]);
  return new Uint8Array(await crypto.subtle.deriveBits({ name: "PBKDF2", hash: "SHA-256", salt, iterations }, key, 256));
}
export const validPin = (pin) => typeof pin === "string" && /^\d{4,6}$/.test(pin);
export async function hashPin(pin) {
  if (!validPin(pin)) throw new DomainError("INVALID_PIN", "Use a 4 to 6 digit PIN.");
  const salt = crypto.getRandomValues(new Uint8Array(16));
  return `pbkdf2-sha256$${PIN_ITERATIONS}$${b64(salt)}$${b64(await pbkdf2(pin, salt, PIN_ITERATIONS))}`;
}
export async function pinMatches(pin, stored) {
  const [scheme, iter, salt, hash] = String(stored ?? "").split("$");
  if (scheme !== "pbkdf2-sha256" || !validPin(pin)) return false;
  const iterations = Number(iter);
  if (!Number.isSafeInteger(iterations) || iterations < 1 || iterations > PIN_ITERATIONS) return false;
  const got = await pbkdf2(pin, unb64(salt), iterations),
    want = unb64(hash);
  if (got.length !== want.length) return false;
  let diff = 0;
  for (let i = 0; i < got.length; i++) diff |= got[i] ^ want[i];
  return diff === 0;
}

const minBig = (...xs) => xs.map(BigInt).reduce((a, b) => (b < a ? b : a)).toString();

async function saveState(db, sessionId, state) {
  await db.prepare("UPDATE ussd_sessions SET state=? WHERE session_id=?").bind(JSON.stringify(state), sessionId).run();
}

/** Plain-language reasons for the contract's refusals. */
export function refusalText(reason) {
  const r = String(reason || "");
  if (/frozen/i.test(r)) return "Your pocket is frozen. Nothing was sent.";
  if (/per-transaction/i.test(r)) return "That is over your per-send limit. Nothing was sent.";
  if (/daily cap/i.test(r)) return "That is over today's limit. Nothing was sent.";
  if (/insufficient/i.test(r)) return "Not enough in your pocket. Nothing was sent.";
  if (/transfer_failed/.test(r)) return "The transfer failed and was refunded to your pocket.";
  return "The pocket refused this send. Nothing was sent.";
}

// Send: 2 -> @username -> amount -> PIN (or 0 to cancel) -> submit.
// The recipient wallet and amount are pinned in the session at the confirm
// screen, so what is sent is exactly what the user saw.
async function sendFlow(input, state, ctx) {
  const { db, p, linked, readPocket, resolveRecipient, sendFromPocket, now } = ctx;
  if (linked.lockedUntil && linked.lockedUntil > now)
    return end("Too many wrong PINs. Sending is locked for 15 minutes.");
  if (!linked.pinHash) return end("Set a PIN for this number in Porti before sending.");
  if (input.length === 1) {
    if ((await readPocket(linked.pocketId)).frozen)
      return end("Your pocket is frozen. Unfreeze it from your main wallet.");
    return con("Send to @username:");
  }
  if (input.length === 2) {
    let to;
    try {
      to = await resolveRecipient(input[1]);
    } catch (e) {
      if (e?.code === "INVALID_USERNAME" || e?.code === "USERNAME_NOT_FOUND")
        return end(`@${input[1].replace(/^@/, "")} has no verified wallet on Porti. Nothing was sent.`);
      throw e;
    }
    const v = await readPocket(linked.pocketId);
    if (v.frozen) return end("Your pocket is frozen. Unfreeze it from your main wallet.");
    const limit = minBig(v.per_tx_cap, v.remaining_today, v.available_balance);
    if (BigInt(limit) <= 0n) return end("Nothing left to send today. Your limit resets at midnight UTC.");
    await saveState(db, p.sessionId, { to: { username: to.username, wallet: to.wallet }, limit });
    return con(`To @${to.username}\n${to.wallet}\nAmount in NEAR (max ${formatNear(limit)}):`);
  }
  if (!state.to) return end("Session expired. Please dial again.");
  if (input.length === 3) {
    const amount = parseAmount(input[2]);
    if (!amount) return end("Enter an amount like 0.05. Nothing was sent.");
    if (BigInt(amount) > BigInt(state.limit))
      return end(`That is over your limit of ${formatNear(state.limit)} NEAR. Nothing was sent.`);
    await saveState(db, p.sessionId, { ...state, amount });
    return con(`Send ${formatNear(amount)} NEAR to @${state.to.username}?\n${state.to.wallet}\nEnter PIN to confirm\n0. Cancel`);
  }
  if (input.length === 4 && state.amount && parseAmount(input[2]) === state.amount) {
    if (input[3] === "0") return end("Cancelled. Nothing was sent.");
    if (!(await pinMatches(input[3], linked.pinHash))) {
      const failures = (linked.pinFailures || 0) + 1;
      const locked = failures >= PIN_MAX_FAILURES;
      await db
        .prepare("UPDATE ussd_phones SET pin_failures=?, locked_until=? WHERE phone=?")
        .bind(locked ? 0 : failures, locked ? now + PIN_LOCK_MS : null, p.phone)
        .run();
      return end(locked ? "Wrong PIN. Sending is locked for 15 minutes." : `Wrong PIN. ${PIN_MAX_FAILURES - failures} tries left. Nothing was sent.`);
    }
    await db.prepare("UPDATE ussd_phones SET pin_failures=0, locked_until=NULL WHERE phone=?").bind(p.phone).run();
    // Claim the session before signing: a replayed or duplicated final request
    // finds nothing to claim, so one confirmation can only ever send once.
    const claimed = await db.prepare("DELETE FROM ussd_sessions WHERE session_id=?").bind(p.sessionId).run();
    if (claimed.meta?.changes !== 1) return end("Session expired. Please dial again.");
    const r = await sendFromPocket({ pocketId: linked.pocketId, receiverId: state.to.wallet, amount: state.amount });
    await db
      .prepare("INSERT INTO ussd_sends (id,phone,pocket_id,receiver_id,username,amount,status,hash,created_at) VALUES (?,?,?,?,?,?,?,?,?)")
      .bind(crypto.randomUUID(), p.phone, linked.pocketId, state.to.wallet, state.to.username, state.amount, r.status, r.hash || null, now)
      .run();
    const ref = r.hash ? `\nRef: ${r.hash.slice(0, 8)}` : "";
    if (r.status === "sent") return end(`Sent ${formatNear(state.amount)} NEAR to @${state.to.username}.${ref}`);
    if (r.status === "refused") return end(refusalText(r.reason) + ref);
    return end(`Submitted. Check Balance in a minute to confirm.${ref}`);
  }
  return end("Invalid choice. Please dial again.");
}

const SHORT_DATE = { day: "numeric", month: "short", timeZone: "UTC" };

/** Last 3 sends from this number that moved (or may have moved) money. */
export async function historyText(db, phone) {
  const { results = [] } = await db
    .prepare("SELECT username,amount,status,created_at AS createdAt FROM ussd_sends WHERE phone=? AND status IN ('sent','pending') ORDER BY created_at DESC LIMIT 3")
    .bind(phone)
    .all();
  if (!results.length) return "No sends yet from this number.";
  return (
    "Last sends:\n" +
    results
      .map((r) => `${formatNear(r.amount)} NEAR @${r.username} ${new Date(r.createdAt).toLocaleDateString("en-GB", SHORT_DATE)}${r.status === "pending" ? " (submitted)" : ""}`)
      .join("\n")
  );
}

// Freeze: 4 -> confirm -> the pocket key calls freeze(). No PIN: freezing only
// ever makes the pocket safer, and must work fast for a lost or stolen phone.
// Unfreezing needs the main wallet.
async function freezeFlow(input, ctx) {
  const { db, p, linked, readPocket, freezePocket } = ctx;
  if (input.length === 1) {
    const v = await readPocket(linked.pocketId);
    if (v.frozen) return end("Your pocket is already frozen. Unfreeze it from your main wallet.");
    return con("Freeze your pocket?\nNo one can send from it until you unfreeze it from your main wallet.\n1. Freeze now\n0. Cancel");
  }
  if (input.length === 2 && input[1] === "0") return end("Cancelled. Your pocket was not frozen.");
  if (input.length === 2 && input[1] === "1") {
    const claimed = await db.prepare("DELETE FROM ussd_sessions WHERE session_id=?").bind(p.sessionId).run();
    if (claimed.meta?.changes !== 1) return end("Session expired. Please dial again.");
    const r = await freezePocket({ pocketId: linked.pocketId });
    const ref = r.hash ? `\nRef: ${r.hash.slice(0, 8)}` : "";
    if (r.status === "done") return end(`Pocket frozen. Nothing can be sent until you unfreeze it from your main wallet.${ref}`);
    if (r.status === "refused") return end(`The pocket refused to freeze. Freeze it from your main wallet.${ref}`);
    return end(`Freeze submitted. Check Balance in a minute to confirm.${ref}`);
  }
  return end("Invalid choice. Please dial again.");
}

// ---- Public simulator (testnet) ----
export const DEMO_PIN = "1234";

/** "bob=porti-bob.testnet,ada=ada.testnet" -> Map(name -> account). Invalid entries are dropped. */
export function parseRecipients(value) {
  const out = new Map();
  for (const part of String(value || "").split(",")) {
    const [name, account] = part.split("=").map((x) => x?.trim().toLowerCase());
    if (/^[a-z][a-z0-9_]{2,19}$/.test(name || "") && /^[a-z0-9._-]{2,64}$/.test(account || "")) out.set(name, account);
  }
  return out;
}
export function directoryRecipient(directory, value) {
  const name = String(value || "").replace(/^@/, "").toLowerCase();
  const wallet = directory.get(name);
  if (!wallet) throw new DomainError("USERNAME_NOT_FOUND", "Unknown demo recipient.", 404);
  return { username: name, wallet };
}

/**
 * Simulator numbers link themselves to the shared demo pocket on first dial,
 * each with the published demo PIN. Per-number rows keep one visitor's wrong
 * PINs from locking out everyone else. Never used for real numbers.
 */
export async function linkSimulatorPhone(db, phone, pocketId, pin, now = Date.now()) {
  if (!isSimulatorPhone(phone)) return;
  const existing = await db.prepare("SELECT 1 AS x FROM ussd_phones WHERE phone=?").bind(phone).first();
  if (existing) return;
  await db
    .prepare("INSERT INTO ussd_phones (phone,pocket_id,channel,pin_hash,pin_failures,created_at) VALUES (?,?,'simulator',?,0,?) ON CONFLICT(phone) DO NOTHING")
    .bind(phone, pocketId, await hashPin(pin), now)
    .run();
}

async function openSession(db, p, channel, now) {
  if (p.text === "") {
    await db.prepare("DELETE FROM ussd_sessions WHERE expires_at < ?").bind(now).run();
    await db
      .prepare(
        "INSERT INTO ussd_sessions (session_id,phone,channel,state,expires_at) VALUES (?,?,?,?,?) ON CONFLICT(session_id) DO NOTHING",
      )
      .bind(p.sessionId, p.phone, channel, "{}", now + SESSION_TTL_MS)
      .run();
  }
  const s = await db
    .prepare("SELECT phone,channel,state,expires_at AS expiresAt FROM ussd_sessions WHERE session_id=?")
    .bind(p.sessionId)
    .first();
  // A session belongs to one phone on one channel; never continue someone else's.
  if (!s || s.phone !== p.phone || s.channel !== channel || s.expiresAt < now) return null;
  return JSON.parse(s.state);
}

async function closeSession(db, sessionId) {
  await db.prepare("DELETE FROM ussd_sessions WHERE session_id=?").bind(sessionId).run();
}

/**
 * @param p parsed payload from parsePayload()
 * @param channel "live" | "simulator"
 * @param deps { db: D1-like, readPocket(pocketId) -> get_pocket view,
 *   resolveRecipient(username) -> { username, wallet },
 *   sendFromPocket({ pocketId, receiverId, amount }) ->
 *     { status: "sent" | "refused" | "pending", hash?, reason? },
 *   freezePocket({ pocketId }) -> { status: "done" | "refused" | "pending", hash? }, now? }
 * @returns USSD reply string (CON/END)
 */
export async function handleUssd(p, channel, { db, readPocket, resolveRecipient, sendFromPocket, freezePocket, now = Date.now() }) {
  const state = await openSession(db, p, channel, now);
  if (!state) return end("Session expired. Please dial again.");
  const linked = await db
    .prepare(
      "SELECT pocket_id AS pocketId, channel, pin_hash AS pinHash, pin_failures AS pinFailures, locked_until AS lockedUntil FROM ussd_phones WHERE phone=?",
    )
    .bind(p.phone)
    .first();
  let reply;
  if (!linked || linked.channel !== channel) {
    reply = end("This number isn't linked to a Porti Pocket. Link it in Porti under Wallets.");
  } else {
    const input = steps(p.text);
    try {
      if (input.length === 0) reply = con(MENU);
      else if (input[0] === "1") reply = end(balanceText(await readPocket(linked.pocketId)));
      else if (input[0] === "2")
        reply = await sendFlow(input, state, { db, p, linked, readPocket, resolveRecipient, sendFromPocket, now });
      else if (input[0] === "3") reply = input.length === 1 ? end(await historyText(db, p.phone)) : end("Invalid choice. Please dial again.");
      else if (input[0] === "4") reply = await freezeFlow(input, { db, p, linked, readPocket, freezePocket });
      else reply = end("Invalid choice. Please dial again.");
    } catch (e) {
      if (!(e instanceof DomainError)) throw e;
      if (e.code === "POCKET_BUSY") reply = end("Another request for this pocket is in progress. Try again shortly.");
      else if (e.code === "POCKET_KEY_MISSING") reply = end("This isn't available right now. Nothing was changed.");
      else reply = end("Your pocket can't be reached right now. Please try again later.");
    }
  }
  if (reply.startsWith("END ")) await closeSession(db, p.sessionId);
  return reply;
}
