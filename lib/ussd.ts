import { env } from "cloudflare:workers";
import { actions, baseDecode, baseEncode, createTransaction, KeyPair, Signature, SignedTransaction } from "near-api-js";
import { createInvestigationReader } from "./near-services";
import { resolveUsername } from "./near-profile";
import { consumeLimit } from "./request-guard.mjs";
import { DomainError } from "./errors.mjs";
import {
  end,
  handleUssd,
  isSimulatorPhone,
  parsePayload,
  tokenMatches,
} from "./ussd-core.mjs";

const DEFAULT_RPC = "https://rpc.mainnet.near.org";
const MAX_BODY = 4000;

// Dev builds only: a loopback RPC (the local NEAR sandbox from
// `npm run pocket:sandbox`) skips the mainnet chain-ID check. Production builds
// compile `import.meta.env.DEV` to false, so they always require mainnet.
const LOOPBACK_RPC = /^http:\/\/(127\.0\.0\.1|localhost):\d{2,5}\/?$/;
async function localSandboxQuery(rpc: string, params: any) {
  const r = await fetch(rpc, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: "ussd", method: "query", params }),
    signal: AbortSignal.timeout(5000),
  }).catch(() => null);
  const d: any = r?.ok ? await r.json().catch(() => null) : null;
  if (!d?.result || d.error)
    throw new DomainError("RPC_READ_FAILED", "The local sandbox could not read this pocket.", 503);
  return d.result;
}

/** Reads the pocket contract's `get_pocket` view on mainnet (validated chain ID). */
export async function readPocket(pocketId: string) {
  const params = {
    request_type: "call_function",
    finality: "final",
    account_id: pocketId,
    method_name: "get_pocket",
    args_base64: "e30=", // {}
  };
  const r: any = await rpcQuery(params);
  try {
    return JSON.parse(new TextDecoder().decode(Uint8Array.from(r.result)));
  } catch {
    throw new DomainError("POCKET_UNREADABLE", "The pocket returned unreadable state.", 503);
  }
}

async function rpcQuery(params: any) {
  const rpc = (env as any).PORTI_USSD_RPC || DEFAULT_RPC;
  return import.meta.env.DEV && LOOPBACK_RPC.test(rpc)
    ? localSandboxQuery(rpc, params)
    : createInvestigationReader(rpc).read("ussd", "query", params);
}

/** Recipient lookup: verified Porti usernames only (lib/near-profile.ts). */
export async function resolveRecipient(name: string) {
  const p: any = await resolveUsername(name);
  return { username: p.username, wallet: p.wallet };
}

const SEND_GAS = BigInt("30000000000000"); // 30 Tgas

/** Panic message from a failed execution outcome, if the contract refused. */
function panicOf(failure: any) {
  const m = /Smart contract panicked: ([^"\\]{1,120})/.exec(JSON.stringify(failure ?? ""));
  return m ? m[1] : "refused";
}

/**
 * Signs `send(receiver_id, amount)` with the pocket's function-call key
 * (PORTI_POCKET_KEY, a Worker secret) and submits it. The key can only call
 * send/freeze on pockets that added it; the contract enforces the caps.
 * One send per pocket at a time, because the key's nonce must increase.
 */
export async function sendFromPocket({ pocketId, receiverId, amount }: { pocketId: string; receiverId: string; amount: string }) {
  const secret = (env as any).PORTI_POCKET_KEY;
  if (typeof secret !== "string" || !secret.startsWith("ed25519:"))
    throw new DomainError("POCKET_KEY_MISSING", "The pocket signing key is not configured.", 503);
  try {
    await consumeLimit(env.DB, "pocket:" + pocketId, "pocket-send", 1, 15_000);
  } catch (e: any) {
    if (e?.code === "RATE_LIMITED") throw new DomainError("POCKET_BUSY", "A send is already in progress.", 429);
    throw e;
  }
  const r = await signAndSubmit(secret, pocketId, receiverId, amount).catch(async (e) => {
    await releasePocket(pocketId);
    throw e;
  });
  // A final outcome frees the pocket at once. A pending send keeps the lock
  // until the window ends, since its nonce may still be in flight.
  if (r.status !== "pending") await releasePocket(pocketId);
  return r;
}

async function releasePocket(pocketId: string) {
  // consumeLimit keys are JSON [owner, bucket, windowStart].
  const prefix = JSON.stringify(["pocket:" + pocketId, "pocket-send"]).slice(0, -1) + ",";
  await env.DB?.prepare("DELETE FROM porti_limits WHERE substr(id,1,?)=?")
    .bind(prefix.length, prefix)
    .run()
    .catch(() => {});
}

async function signAndSubmit(secret: string, pocketId: string, receiverId: string, amount: string) {
  const key = KeyPair.fromString(secret as any);
  const publicKey = key.getPublicKey();
  const access: any = await rpcQuery({
    request_type: "view_access_key",
    finality: "final",
    account_id: pocketId,
    public_key: publicKey.toString(),
  });
  if (!Number.isSafeInteger(access?.nonce) || typeof access?.block_hash !== "string")
    throw new DomainError("POCKET_KEY_MISSING", "This pocket has not added the Porti key.", 503);
  const tx = createTransaction(
    pocketId,
    publicKey,
    pocketId,
    BigInt(access.nonce) + BigInt(1),
    [actions.functionCall("send", { receiver_id: receiverId, amount }, SEND_GAS, BigInt(0))],
    baseDecode(access.block_hash),
  );
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", new Uint8Array(tx.encode())));
  const hash = baseEncode(digest);
  const signed = new SignedTransaction({
    transaction: tx,
    signature: new Signature({ keyType: 0, data: key.sign(digest).signature }),
  });
  const rpc = (env as any).PORTI_USSD_RPC || DEFAULT_RPC;
  // Wait for execution briefly so the user hears the real outcome; on a slow
  // network the session ends with "Submitted" and the hash, never a resend.
  let d: any = null;
  try {
    const r = await fetch(rpc, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: "ussd-send",
        method: "send_tx",
        params: { signed_tx_base64: btoa(String.fromCharCode(...signed.encode())), wait_until: "EXECUTED_OPTIMISTIC" },
      }),
      signal: AbortSignal.timeout(8000),
    });
    d = await r.json().catch(() => null);
  } catch {
    return { status: "pending" as const, hash };
  }
  if (d?.error?.cause?.name === "INVALID_TRANSACTION")
    return { status: "refused" as const, hash, reason: "not accepted" };
  const status = d?.result?.status;
  if (status && "Failure" in status) return { status: "refused" as const, hash, reason: panicOf(status.Failure) };
  if (status && typeof status.SuccessValue === "string") {
    // send() returns on_send's result: false means the transfer failed and was refunded.
    const ok = atob(status.SuccessValue) === "true";
    return ok ? { status: "sent" as const, hash } : { status: "refused" as const, hash, reason: "transfer_failed" };
  }
  return { status: "pending" as const, hash };
}

function reply(text: string, status = 200) {
  return new Response(text, {
    status,
    headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" },
  });
}

async function readPayload(request: Request) {
  const declared = Number(request.headers.get("Content-Length") || 0);
  if (declared > MAX_BODY) return null;
  const body = await request.text();
  if (body.length > MAX_BODY) return null;
  const type = request.headers.get("Content-Type") || "";
  try {
    const fields = type.includes("application/json")
      ? JSON.parse(body)
      : Object.fromEntries(new URLSearchParams(body));
    return parsePayload(fields);
  } catch {
    return null;
  }
}

/**
 * Shared entry for the provider callback (`live`) and the public simulator.
 * Both reach the same state machine; they differ only in who may call them
 * and which phone numbers they accept.
 */
export async function ussdRequest(request: Request, channel: "live" | "simulator") {
  if (channel === "live") {
    const token = new URL(request.url).searchParams.get("token") || "";
    if (!tokenMatches(token, (env as any).PORTI_USSD_TOKEN))
      return reply("Forbidden", 403);
  }
  const p = await readPayload(request);
  if (!p) return reply(end("Invalid request."), 400);
  if (channel === "simulator" && !isSimulatorPhone(p.phone))
    return reply(end("The simulator only accepts +999 test numbers."));
  if (channel === "live" && isSimulatorPhone(p.phone))
    return reply(end("Test numbers are only available in the simulator."));
  try {
    await consumeLimit(env.DB, "ussd:" + p.phone, "ussd", 30, 60_000);
    if (channel === "simulator") {
      const ip = request.headers.get("CF-Connecting-IP") || "local";
      await consumeLimit(env.DB, "ussd-ip:" + ip, "ussd-sim", 60, 60_000);
    }
    return reply(await handleUssd(p, channel, { db: env.DB, readPocket, resolveRecipient, sendFromPocket }));
  } catch (e: any) {
    console.warn(
      JSON.stringify({ component: "porti-ussd", channel, code: e?.code || "INTERNAL_ERROR" }),
    );
    if (e?.code === "RATE_LIMITED") return reply(end("Too many requests. Try again in a minute."));
    return reply(end("Porti is unavailable right now. Please try again later."));
  }
}
