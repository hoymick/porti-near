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

/** Reads the pocket contract's `get_pocket` view on mainnet (validated chain ID). */
export async function readPocket(pocketId: string) {
  const rpc = (env as any).PORTI_USSD_RPC || DEFAULT_RPC;
  const { read } = createInvestigationReader(rpc);
  const r = await read("ussd", "query", {
    request_type: "call_function",
    finality: "final",
    account_id: pocketId,
    method_name: "get_pocket",
    args_base64: "e30=", // {}
  });
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
