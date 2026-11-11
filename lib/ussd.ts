import { env } from "cloudflare:workers";
import { createInvestigationReader } from "./near-services";
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
  const rpc = (env as any).PORTI_USSD_RPC || DEFAULT_RPC;
  const params = {
    request_type: "call_function",
    finality: "final",
    account_id: pocketId,
    method_name: "get_pocket",
    args_base64: "e30=", // {}
  };
  const r =
    import.meta.env.DEV && LOOPBACK_RPC.test(rpc)
      ? await localSandboxQuery(rpc, params)
      : await createInvestigationReader(rpc).read("ussd", "query", params);
  try {
    return JSON.parse(new TextDecoder().decode(Uint8Array.from(r.result)));
  } catch {
    throw new DomainError("POCKET_UNREADABLE", "The pocket returned unreadable state.", 503);
  }
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
    return reply(await handleUssd(p, channel, { db: env.DB, readPocket }));
  } catch (e: any) {
    console.warn(
      JSON.stringify({ component: "porti-ussd", channel, code: e?.code || "INTERNAL_ERROR" }),
    );
    if (e?.code === "RATE_LIMITED") return reply(end("Too many requests. Try again in a minute."));
    return reply(end("Porti is unavailable right now. Please try again later."));
  }
}
