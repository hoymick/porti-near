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
 * @param deps { db: D1-like, readPocket(pocketId) -> get_pocket view, now? }
 * @returns USSD reply string (CON/END)
 */
export async function handleUssd(p, channel, { db, readPocket, now = Date.now() }) {
  const state = await openSession(db, p, channel, now);
  if (!state) return end("Session expired. Please dial again.");
  const linked = await db
    .prepare("SELECT pocket_id AS pocketId, channel FROM ussd_phones WHERE phone=?")
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
      else if (["2", "3", "4"].includes(input[0])) reply = end("This option is coming soon.");
      else reply = end("Invalid choice. Please dial again.");
    } catch (e) {
      if (!(e instanceof DomainError)) throw e;
      reply = end("Your pocket can't be read right now. Please try again later.");
    }
  }
  if (reply.startsWith("END ")) await closeSession(db, p.sessionId);
  return reply;
}
