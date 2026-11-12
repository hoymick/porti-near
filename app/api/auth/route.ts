// Sign in with a NEAR wallet (challenge -> signed message -> session cookie),
// current session, and sign out. Public by design: it is how users sign in.
import { env } from "cloudflare:workers";
import { errorResponse, readJSON, sameOrigin, owner } from "../../../lib/workspace";
import { linkLoginWallet } from "../../../lib/login-wallet.mjs";
import { initialPorti } from "../../../lib/near-services";
import { consumeLimit } from "../../../lib/request-guard.mjs";
import { DomainError } from "../../../lib/errors.mjs";
import { createInvestigationReader } from "../../../lib/near-services";
import {
  clearSessionCookie,
  completeLogin,
  createLoginChallenge,
  revokeSession,
  sessionAccount,
  sessionCookie,
} from "../../../lib/near-session.mjs";

export const dynamic = "force-dynamic";
const DEFAULT_RPC = "https://rpc.mainnet.near.org";

function db() {
  if (!env.DB) throw new DomainError("STORAGE_UNAVAILABLE", "Sign-in is unavailable right now.", 503);
  return env.DB;
}

async function readAccessKeys(account: string) {
  const { read } = createInvestigationReader((env as any).PORTI_RPC_URL || DEFAULT_RPC);
  return read("auth", "query", { request_type: "view_access_key_list", finality: "final", account_id: account });
}

export async function GET(r: Request) {
  try {
    const account = await sessionAccount(db(), r.headers.get("Cookie"));
    return Response.json({ account }, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    return errorResponse(e);
  }
}

export async function POST(r: Request) {
  try {
    sameOrigin(r);
    const input = await readJSON(r, 4000);
    const url = new URL(r.url);
    const secure = url.protocol === "https:";
    const ip = r.headers.get("CF-Connecting-IP") || "local";
    if (input.action === "restore-wallet") {
      const id = await owner();
      await consumeLimit(db(), id, "auth-restore", 30, 60_000);
      const main = await linkLoginWallet(db(), r.headers.get("Cookie"), id, initialPorti);
      return Response.json({ main }, { headers: { "Cache-Control": "no-store" } });
    }
    if (input.action === "challenge") {
      await consumeLimit(db(), "auth-ip:" + ip, "auth-challenge", 20, 60_000);
      return Response.json({ challenge: await createLoginChallenge(db(), input.account, url.origin) });
    }
    if (input.action === "verify") {
      await consumeLimit(db(), "auth-ip:" + ip, "auth-verify", 20, 60_000);
      const s = await completeLogin(db(), { challengeId: input.challengeId, proof: input.proof }, { readAccessKeys });
      // The login proof already establishes ownership. Persist the main role
      // before any workspace feature or chat can race the client restoration.
      // Existing, deliberately different wallet roles are left intact.
      try {
        await linkLoginWallet(db(), sessionCookie(s.token, { secure }), "near:" + s.accountId, initialPorti);
      } catch (e) {
        if (!(e instanceof DomainError) || !["WALLET_CONFLICT", "SAME_WALLET"].includes(e.code)) throw e;
      }
      return Response.json(
        { account: s.accountId },
        { headers: { "Set-Cookie": sessionCookie(s.token, { secure }), "Cache-Control": "no-store" } },
      );
    }
    if (input.action === "logout") {
      await revokeSession(db(), r.headers.get("Cookie"));
      return Response.json(
        { account: null },
        { headers: { "Set-Cookie": clearSessionCookie({ secure }), "Cache-Control": "no-store" } },
      );
    }
    throw new DomainError("INVALID_ACTION", "Use challenge, verify or logout.");
  } catch (e) {
    return errorResponse(e);
  }
}
