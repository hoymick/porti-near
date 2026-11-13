import { env } from "cloudflare:workers";
import { actions, baseDecode, baseEncode, createTransaction, KeyPair, Signature, SignedTransaction } from "near-api-js";
import { createInvestigationReader } from "./near-services";
import { resolveUsername } from "./near-profile";
import { consumeLimit } from "./request-guard.mjs";
import { DomainError } from "./errors.mjs";
import {
  DEMO_PIN,
  directoryRecipient,
  end,
  handleUssd,
  linkSimulatorPhone,
  parseRecipients,
  isSimulatorPhone,
  parsePayload,
  tokenMatches,
} from "./ussd-core.mjs";

const MAINNET_RPC = "https://rpc.mainnet.near.org";
const TESTNET_RPC = "https://rpc.testnet.near.org";
const MAX_BODY = 4000;

/**
 * Each channel runs on its own network with its own key:
 * - live (a real phone line): NEAR mainnet, PORTI_POCKET_KEY, verified Porti usernames.
 * - simulator (+999 numbers): NEAR testnet by default, so anyone can try it with
 *   free test NEAR. PORTI_SIM_POCKET_KEY, recipients from PORTI_SIM_RECIPIENTS.
 */
type Net = { channel: "live" | "simulator"; rpc: string; chainId: "mainnet" | "testnet" | null; key: unknown };
// Dev builds only: a loopback RPC (the local sandbox from `npm run pocket:sandbox`)
// skips the chain-ID check. Production builds compile import.meta.env.DEV to false.
const LOOPBACK_RPC = /^http:\/\/(127\.0\.0\.1|localhost):\d{2,5}\/?$/;

function networkFor(channel: "live" | "simulator"): Net {
  const e = env as any;
  if (channel === "live") return { channel, rpc: e.PORTI_USSD_RPC || MAINNET_RPC, chainId: "mainnet", key: e.PORTI_POCKET_KEY };
  const rpc = e.PORTI_SIM_RPC || TESTNET_RPC;
  const loopback = import.meta.env.DEV && LOOPBACK_RPC.test(rpc);
  return { channel, rpc, chainId: loopback ? null : "testnet", key: e.PORTI_SIM_POCKET_KEY };
}

async function rpcCall(rpc: string, method: string, params: any, timeoutMs = 5000) {
  const r = await fetch(rpc, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ jsonrpc: "2.0", id: "ussd", method, params }),
    signal: AbortSignal.timeout(timeoutMs),
  }).catch(() => null);
  const d: any = r?.ok ? await r.json().catch(() => null) : null;
  // Older query endpoints report errors inside `result` with HTTP 200.
  if (!d?.result || d.error || typeof d.result.error === "string")
    throw new DomainError("RPC_READ_FAILED", "NEAR RPC could not read this pocket.", 503);
  return d.result;
}

const verifiedChains = new Map<string, string>();
async function rpcQuery(net: Net, params: any) {
  if (net.chainId === "mainnet") return createInvestigationReader(net.rpc).read("ussd", "query", params);
  if (net.chainId && verifiedChains.get(net.rpc) !== net.chainId) {
    const status = await rpcCall(net.rpc, "status", []);
    if (status.chain_id !== net.chainId)
      throw new DomainError("RPC_WRONG_CHAIN", `Expected NEAR ${net.chainId}.`, 503);
    verifiedChains.set(net.rpc, net.chainId);
  }
  return rpcCall(net.rpc, "query", params);
}

/** Reads the pocket contract's `get_pocket` view (validated chain ID). */
export async function readPocket(net: Net, pocketId: string) {
  const params = {
    request_type: "call_function",
    finality: "final",
    account_id: pocketId,
    method_name: "get_pocket",
    args_base64: "e30=", // {}
  };
  const r: any = await rpcQuery(net, params);
  try {
    return JSON.parse(new TextDecoder().decode(Uint8Array.from(r.result)));
  } catch {
    throw new DomainError("POCKET_UNREADABLE", "The pocket returned unreadable state.", 503);
  }
}

/** Live: verified Porti usernames only (lib/near-profile.ts). */
async function resolveLiveRecipient(name: string) {
  const p: any = await resolveUsername(name);
  return { username: p.username, wallet: p.wallet };
}

const SEND_GAS = BigInt("30000000000000"); // 30 Tgas

/** Panic message from a failed execution outcome, if the contract refused. */
function panicOf(failure: any) {
  const m = /Smart contract panicked: ([^"\\]{1,120})/.exec(JSON.stringify(failure ?? ""));
  return m ? m[1] : "refused";
}

type CallResult =
  | { status: "ok"; hash: string; value: string }
  | { status: "refused"; hash: string; reason: string }
  | { status: "pending"; hash: string };

/**
 * Calls a pocket method with the pocket's function-call key (PORTI_POCKET_KEY,
 * a Worker secret). That key can only call send/freeze on pockets that added
 * it; the contract enforces the caps. One call per pocket at a time, because
 * the key's nonce must increase.
 */
async function callPocket(net: Net, pocketId: string, method: "send" | "freeze", args: object): Promise<CallResult> {
  const secret = net.key;
  if (typeof secret !== "string" || !secret.startsWith("ed25519:"))
    throw new DomainError("POCKET_KEY_MISSING", "The pocket signing key is not configured.", 503);
  try {
    await consumeLimit(env.DB, "pocket:" + pocketId, "pocket-send", 1, 15_000);
  } catch (e: any) {
    if (e?.code === "RATE_LIMITED") throw new DomainError("POCKET_BUSY", "A pocket call is already in progress.", 429);
    throw e;
  }
  const r = await signAndSubmit(net, secret, pocketId, method, args).catch(async (e) => {
    await releasePocket(pocketId);
    throw e;
  });
  // A final outcome frees the pocket at once. A pending call keeps the lock
  // until the window ends, since its nonce may still be in flight.
  if (r.status !== "pending") await releasePocket(pocketId);
  return r;
}

/** send(receiver_id, amount): returns on_send's result, false = transfer failed and refunded. */
async function sendFromPocket(net: Net, { pocketId, receiverId, amount }: { pocketId: string; receiverId: string; amount: string }) {
  const r = await callPocket(net, pocketId, "send", { receiver_id: receiverId, amount });
  if (r.status !== "ok") return r;
  return r.value === "true"
    ? { status: "sent" as const, hash: r.hash }
    : { status: "refused" as const, hash: r.hash, reason: "transfer_failed" };
}

async function freezePocket(net: Net, { pocketId }: { pocketId: string }) {
  const r = await callPocket(net, pocketId, "freeze", {});
  return r.status === "ok" ? { status: "done" as const, hash: r.hash } : r;
}

async function releasePocket(pocketId: string) {
  // consumeLimit keys are JSON [owner, bucket, windowStart].
  const prefix = JSON.stringify(["pocket:" + pocketId, "pocket-send"]).slice(0, -1) + ",";
  await env.DB?.prepare("DELETE FROM porti_limits WHERE substr(id,1,?)=?")
    .bind(prefix.length, prefix)
    .run()
    .catch(() => {});
}

async function signAndSubmit(
  net: Net,
  secret: string,
  pocketId: string,
  method: string,
  args: object,
  signerId = pocketId,
  deposit = BigInt(0),
): Promise<CallResult> {
  const key = KeyPair.fromString(secret as any);
  const publicKey = key.getPublicKey();
  const access: any = await rpcQuery(net, {
    request_type: "view_access_key",
    finality: "final",
    account_id: signerId,
    public_key: publicKey.toString(),
  });
  if (!Number.isSafeInteger(access?.nonce) || typeof access?.block_hash !== "string")
    throw new DomainError("POCKET_KEY_MISSING", "This pocket has not added the Porti key.", 503);
  const tx = createTransaction(
    signerId,
    publicKey,
    pocketId,
    BigInt(access.nonce) + BigInt(1),
    [actions.functionCall(method, args, SEND_GAS, deposit)],
    baseDecode(access.block_hash),
  );
  const digest = new Uint8Array(await crypto.subtle.digest("SHA-256", new Uint8Array(tx.encode())));
  const hash = baseEncode(digest);
  const signed = new SignedTransaction({
    transaction: tx,
    signature: new Signature({ keyType: 0, data: key.sign(digest).signature }),
  });
  const rpc = net.rpc;
  // Wait for execution briefly so the user hears the real outcome; on a slow
  // network the session ends with "Submitted" and the hash, never a resend.
  let d: any = null;
  try {
    const r = await fetch(rpc, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: "ussd-" + method,
        method: "send_tx",
        params: { signed_tx_base64: btoa(String.fromCharCode(...signed.encode())), wait_until: "EXECUTED_OPTIMISTIC" },
      }),
      signal: AbortSignal.timeout(8000),
    });
    d = await r.json().catch(() => null);
  } catch {
    return { status: "pending", hash };
  }
  if (d?.error?.cause?.name === "INVALID_TRANSACTION") return { status: "refused", hash, reason: "not accepted" };
  const status = d?.result?.status;
  if (status && "Failure" in status) return { status: "refused", hash, reason: panicOf(status.Failure) };
  if (status && typeof status.SuccessValue === "string") return { status: "ok", hash, value: atob(status.SuccessValue) };
  return { status: "pending", hash };
}

// ---- Public testnet demo: keep the shared pocket usable ----
// One visitor's Freeze must not block everyone. On the simulator only, and only
// when PORTI_SIM_OWNER_KEY (the testnet demo owner's key) is set, the server
// calls the owner-only unfreeze() a minute after a freeze. Never on mainnet.
const DEMO_FROZEN_MS = 60_000;
const frozenMark = (pocketId: string) => JSON.stringify(["sim-frozen", pocketId]);

async function demoFreezePocket(net: Net, f: { pocketId: string }) {
  const r = await freezePocket(net, f);
  if (r.status === "done")
    await env.DB?.prepare("INSERT OR REPLACE INTO porti_limits (id,count,expires_at) VALUES (?,1,?)")
      .bind(frozenMark(f.pocketId), Date.now() + DEMO_FROZEN_MS)
      .run();
  return r;
}

async function demoReadPocket(net: Net, pocketId: string) {
  const v = await readPocket(net, pocketId);
  const ownerKey = (env as any).PORTI_SIM_OWNER_KEY;
  if (!v.frozen || net.channel !== "simulator" || typeof ownerKey !== "string" || !ownerKey.startsWith("ed25519:")) return v;
  const mark: any = await env.DB?.prepare("SELECT expires_at AS expiresAt FROM porti_limits WHERE id=?").bind(frozenMark(pocketId)).first();
  if (mark && mark.expiresAt > Date.now()) return v;
  try {
    await consumeLimit(env.DB, "pocket-owner:" + pocketId, "demo-unfreeze", 1, 15_000);
    const r = await signAndSubmit(net, ownerKey, pocketId, "unfreeze", {}, v.owner_id, BigInt(1));
    return r.status === "ok" ? { ...v, frozen: false } : v;
  } catch {
    return v; // stays frozen; the next dial tries again
  }
}

/** Public facts about the simulator, so anyone can verify it on an explorer. */
export function simulatorInfo() {
  const net = networkFor("simulator");
  const e = env as any;
  const network = net.chainId === "testnet" ? "testnet" : net.chainId === null ? "local sandbox" : "unknown";
  const explorer = network === "testnet" ? "https://testnet.nearblocks.io" : null;
  const pocket = typeof e.PORTI_SIM_POCKET === "string" && /^[a-z0-9._-]{2,64}$/.test(e.PORTI_SIM_POCKET) ? e.PORTI_SIM_POCKET : null;
  return {
    network,
    explorer,
    pocket,
    recipients: [...parseRecipients(e.PORTI_SIM_RECIPIENTS)].map(([username, wallet]) => ({ username, wallet })),
    demoPin: pocket ? e.PORTI_SIM_PIN || DEMO_PIN : null,
  };
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
    const net = networkFor(channel);
    const e = env as any;
    if (channel === "simulator" && e.PORTI_SIM_POCKET)
      await linkSimulatorPhone(env.DB, p.phone, e.PORTI_SIM_POCKET, e.PORTI_SIM_PIN || DEMO_PIN);
    const directory = parseRecipients(e.PORTI_SIM_RECIPIENTS);
    // The simulator also returns the full transaction hash in a header, so the
    // page can link it on the explorer. A USSD screen only has room for 8 chars.
    let tx: string | undefined;
    const seen = <T extends { hash?: string }>(r: T) => ((tx = r.hash), r);
    const text = await handleUssd(p, channel, {
      db: env.DB,
      readPocket: (id: string) => (channel === "simulator" ? demoReadPocket(net, id) : readPocket(net, id)),
      resolveRecipient: channel === "live" ? resolveLiveRecipient : async (name: string) => directoryRecipient(directory, name),
      sendFromPocket: async (s: any) => seen(await sendFromPocket(net, s)),
      freezePocket: async (f: any) => seen(await (channel === "simulator" ? demoFreezePocket(net, f) : freezePocket(net, f))),
    });
    const res = reply(text);
    if (channel === "simulator" && tx && /^[1-9A-HJ-NP-Za-km-z]{32,64}$/.test(tx)) res.headers.set("X-Porti-Tx", tx);
    return res;
  } catch (e: any) {
    console.warn(
      JSON.stringify({ component: "porti-ussd", channel, code: e?.code || "INTERNAL_ERROR" }),
    );
    if (e?.code === "RATE_LIMITED") return reply(end("Too many requests. Try again in a minute."));
    return reply(end("Porti is unavailable right now. Please try again later."));
  }
}
