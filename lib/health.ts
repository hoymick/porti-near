import audit from "../docs/security-audit.json";
import { env } from "cloudflare:workers";
import { readWorkspace, mutate } from "./workspace";
import { safePorti, nearRpc, initialPorti } from "./near-services";
import { myProfile } from "./near-profile";
import { telegramState } from "./telegram";
export async function systemStatus(id: string, probe = false) {
  if (!env.DB) throw new Error("Storage unavailable");
  await env.DB.prepare("SELECT count(*) AS n FROM porti_limits WHERE id=?")
    .bind("health-probe")
    .first();
  const raw = (await readWorkspace(id)).state.porti || {},
    p = safePorti({ porti: raw }),
    profile = await myProfile(id),
    telegram = await telegramState(id),
    receipt: any = await env.DB.prepare(
      "SELECT COUNT(*) AS n FROM porti_transfer_receipts WHERE owner_id=?",
    )
      .bind(id)
      .first();
  let rpc: any = raw.lastHealth?.rpc || null;
  if (probe) {
    const started = Date.now();
    try {
      const r = await nearRpc(id, "status", []);
      rpc = {
        ok: r.chain_id === "mainnet",
        checkedAt: Date.now(),
        latencyMs: Date.now() - started,
      };
    } catch {
      rpc = {
        ok: false,
        checkedAt: Date.now(),
        message: "RPC could not complete a verified mainnet read.",
      };
    }
  }
  if (probe)
    await mutate(id, (s) => {
      s.porti ??= initialPorti();
      s.porti.lastHealth = { rpc, checkedAt: Date.now() };
    });
  const inference = p.messages
    .filter(
      (m: any) => m.role === "assistant" && m.provider === "NEAR AI Cloud",
    )
    .at(-1);
  return {
    version: "0.10.0",
    dependencyAudit: { checkedAt: audit.checkedAt, ...audit.vulnerabilities },
    state: "launch-verification-required",
    deploymentBoundary: "owner-private-required",
    checkedAt: Date.now(),
    database: { ok: true },
    rpc,
    providers: {
      aiConfigured: p.aiConfigured,
      indexerConfigured: p.indexConfigured,
      rpcConfigured: p.rpcConfigured,
    },
    evidence: {
      inferenceAt: inference?.createdAt || null,
      walletProof: !!Object.keys(p.walletRoles).length,
      profileProof: !!profile,
      verifiedTransfers: Number(receipt?.n) || 0,
      telegramLinked: telegram.linked || false,
      telegramDeliveryAt: telegram.lastDelivery || null,
    },
    telegram: {
      configured: telegram.configured,
      schedule: telegram.schedule,
      lastRun: telegram.lastRun,
      lastError: telegram.lastError || null,
    },
    limits: {
      chatPerMinute: 6,
      chatPerDay: 100,
      researchPerMinute: 12,
      chartPerMinute: 30,
      friendRequestsPerHour: 10,
    },
    retention: { friendMessagesDays: 90, telegramDays: 7 },
    remaining: [
      "Independent security review and recovery drill need external verification.",
      "Wallet signing, NEAR AI inference and Telegram delivery need real account acceptance when evidence is absent.",
      "Public launch requires separate runner authorization; the current shared updater relies on owner-private hosting.",
    ],
  };
}
