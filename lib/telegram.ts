import { consumeLimit, responseJSON } from "./request-guard.mjs";
import { env } from "cloudflare:workers";
import { DomainError } from "./errors.mjs";
import {
  encryptNear,
  decryptNear,
  nearInvestigate,
  saveObservation,
} from "./near-services";
import { readWorkspace } from "./workspace";
const db = () => {
  if (!env.DB)
    throw new DomainError(
      "STORAGE_UNAVAILABLE",
      "Storage is not configured.",
      503,
    );
  return env.DB;
};
const hash = async (s: string) =>
  [
    ...new Uint8Array(
      await crypto.subtle.digest("SHA-256", new TextEncoder().encode(s)),
    ),
  ]
    .map((x) => x.toString(16).padStart(2, "0"))
    .join("");
export async function telegramCall(
  token: string,
  method: string,
  body: any = {},
) {
  let r: any, d: any;
  try {
    r = await fetch(`https://api.telegram.org/bot${token}/${method}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      redirect: "manual",
      signal: AbortSignal.timeout(12000),
    });
    d = await responseJSON(r, 300000);
  } catch {
    throw new DomainError(
      "TELEGRAM_UNAVAILABLE",
      "Telegram did not acknowledge this request. No delivery was confirmed.",
      503,
    );
  }
  if (!r.ok || !d.ok) {
    const e: any = new DomainError(
      "TELEGRAM_PROVIDER",
      `Telegram returned HTTP ${r.status}. Check bot access and try later.`,
      503,
    );
    e.retryAfter = Math.min(86400, Number(d.parameters?.retry_after) || 60);
    e.terminal = [400, 401, 403].includes(r.status);
    throw e;
  }
  return d.result;
}
async function bot(id: string) {
  const r: any = await db()
    .prepare("SELECT * FROM porti_telegram_bots WHERE owner_id=?")
    .bind(id)
    .first();
  return r ? { ...r, p: JSON.parse(r.state) } : null;
}
export async function telegramState(id: string) {
  const b = await bot(id),
    run: any = await db()
      .prepare("SELECT value FROM porti_runs WHERE id='telegram'")
      .first(),
    schedule: any = await db()
      .prepare("SELECT value FROM porti_runs WHERE id='schedule'")
      .first();
  if (!b)
    return {
      configured: false,
      lastRun: run ? JSON.parse(run.value).at : null,
      schedule: schedule ? JSON.parse(schedule.value) : null,
    };
  const p = b.p;
  const count: any = await db()
    .prepare(
      "SELECT COUNT(*) AS n FROM porti_telegram_outbox WHERE owner_id=? AND status='pending'",
    )
    .bind(id)
    .first();
  return {
    configured: true,
    username: p.username,
    linked: !!p.chat,
    paused: !!p.paused,
    candidate: p.candidate ? { label: p.candidate.label } : null,
    linkExpires: p.linkExpires || null,
    preferences: p.preferences || { risk: true, receipts: true, balance: true },
    pending: count.n,
    lastDelivery: p.lastDelivery || null,
    lastError: p.lastError || null,
    lastRun: p.lastRun || null,
    schedule: schedule ? JSON.parse(schedule.value) : null,
  };
}
async function locked<T>(
  id: string,
  fn: (p: any, token: string) => Promise<T>,
): Promise<T> {
  const lease = crypto.randomUUID(),
    until = Date.now() + 240000;
  const lock = await db()
    .prepare(
      "UPDATE porti_telegram_bots SET lease_until=?,lease_id=? WHERE owner_id=? AND lease_until<?",
    )
    .bind(until, lease, id, Date.now())
    .run();
  if (!lock.meta.changes)
    throw new DomainError(
      "TELEGRAM_BUSY",
      "Telegram is busy. Try again shortly.",
      409,
    );
  const b = await bot(id);
  try {
    const token = await decryptNear(b.p.cipher, "telegram:" + id),
      result = await fn(b.p, token);
    return result;
  } finally {
    await db()
      .prepare(
        "UPDATE porti_telegram_bots SET state=?,lease_until=0,lease_id=NULL WHERE owner_id=? AND lease_id=?",
      )
      .bind(JSON.stringify(b.p), id, lease)
      .run();
  }
}
export async function telegramAction(id: string, input: any) {
  if (input.action === "save-bot") {
    if (
      typeof input.token !== "string" ||
      !/^\d{5,20}:[A-Za-z0-9_-]{25,100}$/.test(input.token)
    )
      throw new DomainError(
        "INVALID_BOT",
        "Enter a valid dedicated BotFather token in this secure field.",
      );
    const me = await telegramCall(input.token, "getMe"),
      webhook = await telegramCall(input.token, "getWebhookInfo");
    if (!me.is_bot || !/^\w{5,32}$/.test(me.username) || webhook.url)
      throw new DomainError(
        "BOT_IN_USE",
        "Use a dedicated bot without an active webhook. Existing webhook settings were not changed.",
      );
    const p = {
      cipher: await encryptNear(input.token, "telegram:" + id),
      username: me.username,
      preferences: { risk: true, receipts: true, balance: true },
      offset: 0,
      createdAt: Date.now(),
      paused: true,
    };
    try {
      const r = await db()
        .prepare(
          "INSERT INTO porti_telegram_bots(owner_id,bot_id,state) VALUES(?,?,?) ON CONFLICT(owner_id) DO UPDATE SET bot_id=excluded.bot_id,state=excluded.state WHERE porti_telegram_bots.lease_until<?",
        )
        .bind(id, String(me.id), JSON.stringify(p), Date.now())
        .run();
      if (!r.meta.changes) throw new Error();
      await db()
        .prepare("DELETE FROM porti_telegram_outbox WHERE owner_id=?")
        .bind(id)
        .run();
    } catch {
      throw new DomainError(
        "BOT_UNAVAILABLE",
        "Bot is already assigned or a delivery is in progress. Use a dedicated bot and try later.",
        409,
      );
    }
    return {
      message: "Dedicated bot verified. Link your private Telegram chat next.",
    };
  }
  return locked(id, async (p, token) => {
    if (input.action === "link") {
      const code = [...crypto.getRandomValues(new Uint8Array(24))]
        .map((x) => x.toString(16).padStart(2, "0"))
        .join("");
      p.linkHash = await hash(code);
      p.linkExpires = Date.now() + 600000;
      delete p.candidate;
      return {
        link: `https://t.me/${p.username}?start=${code}`,
        message:
          "Open Telegram, press Start, then check for your account here. Link expires in ten minutes.",
      };
    }
    if (input.action === "confirm") {
      if (!p.candidate || p.linkExpires < Date.now())
        throw new DomainError(
          "LINK_EXPIRED",
          "Create a fresh link and press Start in Telegram.",
        );
      await db()
        .prepare("DELETE FROM porti_telegram_outbox WHERE owner_id=?")
        .bind(id)
        .run();
      p.chat = p.candidate.chat;
      p.chatLabel = p.candidate.label;
      p.linkedAt = Date.now();
      p.paused = false;
      p.version = crypto.randomUUID();
      delete p.candidate;
      delete p.linkHash;
      delete p.linkExpires;
      return {
        message: "Private Telegram chat linked. Alerts can now be delivered.",
      };
    }
    if (input.action === "disconnect") {
      delete p.chat;
      delete p.candidate;
      delete p.linkHash;
      p.paused = true;
      await db()
        .prepare("DELETE FROM porti_telegram_outbox WHERE owner_id=?")
        .bind(id)
        .run();
      return { message: "Telegram chat disconnected." };
    }
    if (input.action === "preferences") {
      p.preferences = {
        risk: input.risk === true,
        receipts: input.receipts === true,
        balance: input.balance === true,
      };
      p.paused = input.paused === true;
      return { message: "Telegram preferences saved." };
    }
    if (input.action === "test") {
      if (!p.chat || p.paused)
        throw new DomainError(
          "NOT_LINKED",
          "Link your private chat and resume delivery first.",
        );
      const sent = await telegramCall(token, "sendMessage", {
        chat_id: p.chat,
        text: "Porti test alert — your private NEAR observation alerts are connected.",
      });
      if (!Number.isInteger(sent.message_id) || sent.message_id <= 0)
        throw new DomainError(
          "NO_ACK",
          "Telegram returned no delivery acknowledgement.",
        );
      p.lastDelivery = Date.now();
      return { message: "Test acknowledged by Telegram." };
    }
    if (input.action !== "check")
      throw new DomainError("TELEGRAM_ACTION", "Unknown Telegram action.");
    return check(id, p, token);
  });
}
async function check(id: string, p: any, token: string) {
  if (p.retryAt && p.retryAt > Date.now())
    return {
      message:
        "Telegram provider cooldown is active. The queue will retry later.",
    };
  let updates: any[];
  try {
    updates = await telegramCall(token, "getUpdates", {
      offset: p.offset || 0,
      limit: 50,
      timeout: 0,
      allowed_updates: ["message"],
    });
  } catch (e: any) {
    p.lastRun = Date.now();
    p.lastError = e.message;
    p.retryAt = Date.now() + (e.retryAfter || 60) * 1000;
    if (e.terminal) p.paused = true;
    throw e;
  }
  for (const u of updates) {
    if (!Number.isInteger(u.update_id) || u.update_id < (p.offset || 0))
      continue;
    const m = u.message;
    if (
      m?.chat?.type === "private" &&
      String(m.chat.id) === String(m.from?.id)
    ) {
      const text = String(m.text || "");
      if (
        p.linkHash &&
        p.linkExpires > Date.now() &&
        /^\/start [a-f0-9]{48}$/.test(text) &&
        (await hash(text.slice(7))) === p.linkHash
      ) {
        p.candidate = {
          chat: String(m.chat.id),
          label: m.from.username
            ? "@" + String(m.from.username).slice(0, 40)
            : String(m.from.first_name || "Telegram account").slice(0, 60),
        };
        delete p.linkHash;
      }
      if (p.chat === String(m.chat.id)) {
        if (text === "/pause") p.paused = true;
        if (text === "/resume") p.paused = false;
        if (text === "/stop") {
          delete p.chat;
          p.paused = true;
          await db()
            .prepare("DELETE FROM porti_telegram_outbox WHERE owner_id=?")
            .bind(id)
            .run();
        }
      }
    }
    p.offset = u.update_id + 1;
  }
  p.lastRun = Date.now();
  await db()
    .prepare(
      "DELETE FROM porti_telegram_outbox WHERE owner_id=? AND created_at<?",
    )
    .bind(id, Date.now() - 7 * 86400000)
    .run();
  if (!p.chat || p.paused)
    return {
      message:
        "Telegram account checked. Confirm the account shown here to enable delivery.",
    };
  await db()
    .prepare(
      "DELETE FROM porti_telegram_outbox WHERE owner_id=? AND created_at<?",
    )
    .bind(id, Date.now() - 7 * 86400000)
    .run();
  const pending = await db()
    .prepare(
      "SELECT * FROM porti_telegram_outbox WHERE owner_id=? AND status='pending' AND version=? AND next_at<=? ORDER BY created_at LIMIT 3",
    )
    .bind(id, p.version, Date.now())
    .all();
  let count = 0;
  for (const e of pending.results as any[]) {
    try {
      const sent = await telegramCall(token, "sendMessage", {
        chat_id: p.chat,
        text: e.text,
      });
      if (!Number.isInteger(sent.message_id) || sent.message_id <= 0)
        throw new DomainError(
          "NO_ACK",
          "Telegram did not return a message acknowledgement.",
        );
      await db()
        .prepare(
          "UPDATE porti_telegram_outbox SET status='sent',sent_at=?,message_id=? WHERE id=?",
        )
        .bind(Date.now(), sent.message_id, e.id)
        .run();
      p.lastDelivery = Date.now();
      p.lastError = null;
      delete p.retryAt;
      count++;
    } catch (error: any) {
      p.lastError = error.message;
      p.retryAt = Date.now() + Math.max(error.retryAfter || 60, 60) * 1000;
      const attempts = e.attempts + 1;
      await db()
        .prepare(
          "UPDATE porti_telegram_outbox SET status=?,attempts=?,next_at=? WHERE id=?",
        )
        .bind(
          error.terminal || attempts >= 5 ? "failed" : "pending",
          attempts,
          Date.now() +
            Math.max(
              error.retryAfter || 60,
              Math.min(3600, 60 * 2 ** attempts),
            ) *
              1000,
          e.id,
        )
        .run();
      if (error.terminal) p.paused = true;
      break;
    }
  }
  return {
    message: `Telegram checked; ${count} message${count === 1 ? "" : "s"} acknowledged.`,
  };
}
export async function runTelegram() {
  try {
    await consumeLimit(db(), "maintenance", "telegram-run", 1, 60000);
  } catch (e: any) {
    if (e.code === "RATE_LIMITED")
      return { throttled: true, retryAfter: e.retryAfter };
    throw e;
  }
  const now = Date.now(),
    lease = crypto.randomUUID();
  await db()
    .prepare("INSERT OR IGNORE INTO porti_runs(id,value) VALUES('lease','0')")
    .run();
  const lock = await db()
    .prepare(
      "UPDATE porti_runs SET value=? WHERE id='lease' AND CAST(value AS INTEGER)<?",
    )
    .bind(String(now + 300000), now)
    .run();
  if (!lock.meta.changes) return { busy: true };
  const summary: any = { at: now, checked: 0, failed: 0 };
  try {
    await db()
      .prepare(
        "DELETE FROM porti_limits WHERE id IN (SELECT id FROM porti_limits WHERE expires_at<? LIMIT 1000)",
      )
      .bind(now - 86400000)
      .run();
    await db()
      .prepare(
        "DELETE FROM friend_messages WHERE id IN (SELECT id FROM friend_messages WHERE created_at<? LIMIT 1000)",
      )
      .bind(now - 90 * 86400000)
      .run();
    await db()
      .prepare("DELETE FROM porti_telegram_outbox WHERE created_at<?")
      .bind(now - 7 * 86400000)
      .run();
    const bots = await db()
      .prepare(
        "SELECT owner_id FROM porti_telegram_bots ORDER BY COALESCE(json_extract(state,'$.lastRun'),0) LIMIT 3",
      )
      .all();
    for (const b of bots.results as any[]) {
      try {
        const state = (await readWorkspace(b.owner_id)).state.porti;
        if (state) {
          const checks = state.watchChecks || {},
            due = (state.watches || [])
              .filter(
                (w: any) => !w.paused && now - (checks[w.id] || 0) > 900000,
              )
              .sort(
                (a: any, b: any) => (checks[a.id] || 0) - (checks[b.id] || 0),
              )[0];
          if (due) {
            const { mutate } = await import("./workspace");
            await mutate(b.owner_id, (s) => {
              s.porti.watchChecks ??= {};
              s.porti.watchChecks[due.id] = now;
            });
            try {
              await saveObservation(
                b.owner_id,
                await nearInvestigate(b.owner_id, due.kind, due.address),
              );
            } catch {
              summary.failed++;
            }
          }
        }
        await telegramAction(b.owner_id, { action: "check" });
        summary.checked++;
      } catch {
        summary.failed++;
        await db()
          .prepare(
            "UPDATE porti_telegram_bots SET state=json_set(state,'$.lastRun',?) WHERE owner_id=? AND lease_until<?",
          )
          .bind(Date.now(), b.owner_id, Date.now())
          .run();
      }
    }
    await db()
      .prepare(
        "INSERT INTO porti_runs(id,value) VALUES('telegram',?) ON CONFLICT(id) DO UPDATE SET value=excluded.value",
      )
      .bind(JSON.stringify(summary))
      .run();
    return summary;
  } finally {
    await db()
      .prepare("UPDATE porti_runs SET value='0' WHERE id='lease' AND value=?")
      .bind(String(now + 300000))
      .run();
  }
}
export async function enqueueTelegram(
  id: string,
  event: { key: string; type: string; text: string },
) {
  const b = await bot(id);
  if (!b?.p.chat || b.p.paused) return;
  const p = b.p;
  if (
    (event.type === "concentration" && p.preferences?.risk === false) ||
    (event.type === "receipt" && p.preferences?.receipts === false) ||
    (event.type === "balance" && p.preferences?.balance === false)
  )
    return;
  const key = await hash(id + ":" + p.version + ":" + event.key);
  await db()
    .prepare(
      `INSERT OR IGNORE INTO porti_telegram_outbox(id,owner_id,text,version,created_at) SELECT ?,?,?,?,? WHERE EXISTS(SELECT 1 FROM porti_telegram_bots WHERE owner_id=? AND json_extract(state,'$.version')=? AND json_extract(state,'$.chat') IS NOT NULL AND COALESCE(json_extract(state,'$.paused'),0)=0) AND (SELECT COUNT(*) FROM porti_telegram_outbox WHERE owner_id=? AND status='pending')<200`,
    )
    .bind(
      key,
      id,
      event.text.slice(0, 3500),
      p.version,
      Date.now(),
      id,
      p.version,
      id,
    )
    .run();
}
export async function telegramBalanceEvent(
  id: string,
  previous: any,
  current: any,
) {
  if (
    current.kind !== "wallet" ||
    !previous ||
    !/^\d+$/.test(previous.metadata?.coin_balance) ||
    !/^\d+$/.test(current.metadata?.coin_balance)
  )
    return;
  const before = BigInt(previous.metadata.coin_balance),
    after = BigInt(current.metadata.coin_balance),
    delta = after - before;
  if (delta === BigInt(0)) return;
  const { decimal } = await import("./near-core.mjs");
  await enqueueTelegram(id, {
    key: `balance:${current.address}:${current.checkedAt}`,
    type: "balance",
    text: `Porti native balance change\n${current.address}\n${delta > BigInt(0) ? "+" : "-"}${decimal((delta < BigInt(0) ? -delta : delta).toString(), 24)} NEAR since the previous observation.\nThis is a balance delta, not proof of a buy or a full transaction feed.`,
  });
}
