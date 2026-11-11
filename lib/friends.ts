import { env } from "cloudflare:workers";
import { DomainError } from "./errors.mjs";
import { username } from "./near-identity.mjs";
const db = () => {
  if (!env.DB)
    throw new DomainError(
      "STORAGE_UNAVAILABLE",
      "Storage is not configured.",
      503,
    );
  return env.DB;
};
const fail = (m: string) => {
  throw new DomainError("FRIEND_ACTION", m, 403);
};
export async function socialProfile(id: string) {
  const p: any = await db()
    .prepare("SELECT username FROM profiles WHERE owner_id=?")
    .bind(id)
    .first();
  if (!p)
    fail("Link your verified Porti profile before using friends and chat.");
  return p;
}
async function key(a: string, b: string) {
  return [
    ...new Uint8Array(
      await crypto.subtle.digest(
        "SHA-256",
        new TextEncoder().encode([a, b].sort().join("\n")),
      ),
    ),
  ]
    .map((x) => x.toString(16).padStart(2, "0"))
    .join("");
}
export async function friendsState(id: string, pair?: string) {
  let p;
  try { p = await socialProfile(id); }
  catch (error) { if (pair || !(error instanceof DomainError) || error.code!=='FRIEND_ACTION') throw error; return {profileRequired:true,links:[],messages:[],pair:null}; }
  const links = await db()
    .prepare(
      `SELECT f.pair, f.status, f.requester=? AS outgoing, f.blocker=? AS blockedByMe, f.updated_at AS updatedAt, p.username FROM friend_links f JOIN profiles p ON p.owner_id=CASE WHEN f.a=? THEN f.b ELSE f.a END WHERE (f.a=? OR f.b=?) AND (f.status<>'blocked' OR f.blocker=?) ORDER BY f.updated_at DESC LIMIT 100`,
    )
    .bind(id, id, id, id, id, id)
    .all();
  let messages: any[] = [];
  if (pair) {
    await friendAllowed(id, pair);
    const r = await db()
      .prepare(
        `SELECT m.id,m.body,m.created_at AS createdAt,m.sender=? AS mine FROM friend_messages m JOIN friend_links f ON f.pair=m.pair JOIN profiles pa ON pa.owner_id=f.a JOIN profiles pb ON pb.owner_id=f.b WHERE m.pair=? AND f.status='accepted' AND (f.a=? OR f.b=?) AND m.created_at>? ORDER BY m.created_at DESC,m.id DESC LIMIT 50`,
      )
      .bind(id, pair, id, id, Date.now() - 90 * 86400000)
      .all();
    messages = r.results.reverse();
  }
  return {
    username: p.username,
    links: links.results,
    messages,
    pair: pair || null,
  };
}
export async function friendAllowed(id: string, pair: string) {
  const r: any = await db()
    .prepare(
      `SELECT f.pair FROM friend_links f JOIN profiles pa ON pa.owner_id=f.a JOIN profiles pb ON pb.owner_id=f.b WHERE f.pair=? AND (f.a=? OR f.b=?) AND f.status='accepted'`,
    )
    .bind(pair, id, id)
    .first();
  if (!r)
    fail(
      "This conversation is not available. Both profiles must be linked, accepted and unblocked.",
    );
  return r;
}
export async function friendAction(id: string, input: any) {
  await socialProfile(id);
  const now = Date.now();
  if (input.action === "request") {
    let name;
    try {
      name = username(input.username);
    } catch {
      fail("Enter an exact Porti username.");
    }
    const other: any = await db()
      .prepare("SELECT owner_id FROM profiles WHERE username=?")
      .bind(name)
      .first();
    if (!other || other.owner_id === id)
      fail("Choose another verified Porti username.");
    const pair = await key(id, other.owner_id),
      [a, b] = [id, other.owner_id].sort();
    const count: any = await db()
      .prepare(
        "SELECT COUNT(*) AS n FROM friend_links WHERE (a=? OR b=?) AND (status IN ('pending','accepted') OR (requester=? AND updated_at>?))",
      )
      .bind(id, id, id, now - 3600000)
      .first();
    if (count.n >= 50) fail("Friend request limit reached.");
    const r = await db()
      .prepare(
        `INSERT INTO friend_links (pair,a,b,requester,status,updated_at) SELECT ?,?,?,?,'pending',? WHERE (SELECT COUNT(*) FROM friend_links WHERE (a=? OR b=?) AND status IN ('pending','accepted'))<50 AND (SELECT COUNT(*) FROM friend_links WHERE (a=? OR b=?) AND status IN ('pending','accepted'))<50 AND EXISTS(SELECT 1 FROM profiles WHERE owner_id=? AND username=?) ON CONFLICT(pair) DO UPDATE SET requester=excluded.requester,status='pending',updated_at=excluded.updated_at WHERE friend_links.status='removed' AND friend_links.updated_at<?`,
      )
      .bind(
        pair,
        a,
        b,
        id,
        now,
        id,
        id,
        other.owner_id,
        other.owner_id,
        other.owner_id,
        name,
        now - 86400000,
      )
      .run();
    if (r.meta.changes !== 1)
      fail(
        "A request, friendship or block already exists. Removed requests have a 24-hour cooldown.",
      );
    return;
  }
  const pair = String(input.pair || "");
  if (!/^[a-f0-9]{64}$/.test(pair)) fail("Choose a conversation.");
  const link: any = await db()
    .prepare("SELECT * FROM friend_links WHERE pair=? AND (a=? OR b=?)")
    .bind(pair, id, id)
    .first();
  if (!link) fail("Friendship not found.");
  if (input.action === "send") {
    await friendAllowed(id, pair);
    if(input.imageId){
      if(typeof input.text!=="string"||input.text.length>1000)fail("Photo captions can contain up to 1,000 characters.");
      const {imageFor}=await import("./media");
      await imageFor(id,input.imageId,"friend",pair);
      input.text=JSON.stringify({portiImage:input.imageId,caption:input.text});
    }
    if (
      typeof input.text !== "string" ||
      !input.text.trim() ||
      input.text.length > 2000 ||
      typeof input.id !== "string" ||
      !/^[a-zA-Z0-9-]{10,80}$/.test(input.id)
    )
      fail("Use a message of 1–2,000 characters.");
    const r = await db()
      .prepare(
        `INSERT OR IGNORE INTO friend_messages (id,pair,sender,body,created_at) SELECT ?,?,?,?,? WHERE EXISTS(SELECT 1 FROM friend_links f JOIN profiles pa ON pa.owner_id=f.a JOIN profiles pb ON pb.owner_id=f.b WHERE pair=? AND status='accepted' AND (a=? OR b=?)) AND NOT EXISTS(SELECT 1 FROM friend_messages WHERE sender=? AND created_at>?)`,
      )
      .bind(
        input.id,
        pair,
        id,
        input.text.trim(),
        now,
        pair,
        id,
        id,
        id,
        now - 2000,
      )
      .run();
    if (!r.meta.changes) {
      const duplicate: any = await db()
        .prepare(
          "SELECT id,body FROM friend_messages WHERE id=? AND sender=? AND pair=?",
        )
        .bind(input.id, id, pair)
        .first();
      if (duplicate && duplicate.body !== input.text.trim())
        fail("Message ID was already used for different content.");
      if (!duplicate)
        fail("Wait two seconds or refresh the conversation before sending.");
    }
    return;
  }
  let status = "removed",
    condition = "status IN ('pending','accepted')",
    extra: any[] = [];
  if (input.action === "accept") {
    status = "accepted";
    condition = "status='pending' AND requester<>?";
    extra = [id];
  } else if (input.action === "cancel") {
    condition = "status='pending' AND requester=?";
    extra = [id];
  } else if (input.action === "decline") {
    condition = "status='pending' AND requester<>?";
    extra = [id];
  } else if (input.action === "remove") {
    condition = "status='accepted'";
  } else if (input.action === "block") {
    status = "blocked";
    condition = "(status<>'blocked' OR blocker=?)";
    extra = [id];
  } else if (input.action === "unblock") {
    condition = "status='blocked' AND blocker=?";
    extra = [id];
  } else
    fail("Unknown friend action.");
  const r = await db()
    .prepare(
      `UPDATE friend_links SET status=?, blocker=?, updated_at=? WHERE pair=? AND (a=? OR b=?) AND ${condition}`,
    )
    .bind(status, status === "blocked" ? id : null, now, pair, id, id, ...extra)
    .run();
  if (!r.meta.changes) fail("Friendship changed. Refresh before trying again.");
}
