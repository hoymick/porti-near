import {
  owner,
  readWorkspace,
  mutate,
  sameOrigin,
  errorResponse,
  readJSON,
  limit,
} from "../../../lib/workspace";
import { DomainError } from "../../../lib/errors.mjs";
import {
  initialPorti,
  safePorti,
  savePortiSettings,
  nearInvestigate,
  saveObservation,
  addNearWatch,
  prepareNearTransfer,
  validateNearDraft,
  reconcileNearTransfer,
  recordSubmittedHash,
  nearRpc,
} from "../../../lib/near-services";
import { nearChat } from "../../../lib/near-agent";
import {
  myProfile,
  profileChallenge,
  verifyProfile,
  unlinkProfile,
  resolveUsername,
} from "../../../lib/near-profile";
import { walletAction } from "../../../lib/porti-wallets";
export const dynamic = "force-dynamic";
export async function GET() {
  try {
    const id = await owner();
    await limit(id, "state-read", 120);
    return Response.json(
      {
        porti: safePorti((await readWorkspace(id)).state),
        profile: await myProfile(id),
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (e) {
    return errorResponse(e);
  }
}
export async function POST(request: Request) {
  try {
    sameOrigin(request);
    const id = await owner();
    const input = await readJSON(request, 12000);
    const group =
      input.action === "chat"
        ? "chat"
        : [
              "prepare-transfer",
              "validate-draft",
              "record-transfer",
              "save-transfer-hash",
            ].includes(input.action)
          ? "transfers"
          : ["investigate", "check-rpc"].includes(input.action)
            ? "research"
            : "settings";
    await limit(
      id,
      group,
      group === "chat"
        ? 6
        : group === "research"
          ? 12
          : group === "transfers"
            ? 15
            : 30,
    );
    if (group === "chat") await limit(id, "chat-day", 100, 86400000);
    let result: any = {};
    const action = input.action;
    if (["wallet-challenge", "wallet-verify", "wallet-unlink"].includes(action))
      result = await walletAction(id, input, new URL(request.url).origin);
    else if (["save-ai", "save-index", "save-rpc"].includes(action))
      result = await savePortiSettings(id, input);
    else if (action === "chat") result = await nearChat(id, input);
    else if (action === "investigate") {
      const snapshot = await nearInvestigate(id, input.kind, input.account);
      await saveObservation(id, snapshot);
      result = { snapshot };
    } else if (action === "watch")
      result = await addNearWatch(
        id,
        input.kind,
        input.account,
        input.label || "",
      );
    else if (action === "prepare-transfer")
      result = { draft: await prepareNearTransfer(id, input) };
    else if (action === "validate-draft")
      result = { draft: await validateNearDraft(id, input.draftId) };
    else if (action === "save-transfer-hash")
      result = await recordSubmittedHash(id, input.draftId, input.hash);
    else if (action === "record-transfer")
      result = {
        receipt: await reconcileNearTransfer(id, input.draftId, input.hash),
      };
    else if (action === "profile-challenge")
      result = {
        challenge: await profileChallenge(
          id,
          input,
          new URL(request.url).origin,
        ),
      };
    else if (action === "verify-profile")
      result = { profile: await verifyProfile(id, input.proof) };
    else if (action === "resolve")
      result = { recipient: await resolveUsername(input.username) };
    else if (action === "unlink-profile") result = await unlinkProfile(id);
    else if (action === "check-rpc") {
      const d = await nearRpc(id, "status", []);
      if (d.chain_id !== "mainnet")
        throw new DomainError("WRONG_NETWORK", "RPC is not NEAR mainnet.");
      result = { message: "NEAR mainnet RPC connected." };
    } else if (
      [
        "unwatch",
        "pause-watch",
        "read-alerts",
        "clear-chat",
        "remove-ai",
        "remove-index",
      ].includes(action)
    ) {
      await mutate(id, (s) => {
        s.porti ??= initialPorti();
        const p = s.porti;
        if (action === "unwatch")
          p.watches = p.watches.filter((w: any) => w.id !== input.id);
        if (action === "pause-watch") {
          const w = p.watches.find((w: any) => w.id === input.id);
          if (w) w.paused = !w.paused;
        }
        if (action === "read-alerts")
          p.alerts = p.alerts.map((a: any) => ({ ...a, read: true }));
        if (action === "clear-chat") {
          if (p.chatLock && Date.now() - p.chatLock.at < 300000)
            throw new DomainError(
              "CHAT_BUSY",
              "Wait for Porti to finish before clearing chat.",
            );
          p.messages = [];
        }
        if (action === "remove-ai") delete p.aiKeyCipher;
        if (action === "remove-index") delete p.indexKeyCipher;
      });
    } else throw new DomainError("INVALID_ACTION", "Unknown Porti action.");
    return Response.json(
      {
        ...result,
        porti: safePorti((await readWorkspace(id)).state),
        profile: await myProfile(id),
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (e) {
    return errorResponse(e);
  }
}
