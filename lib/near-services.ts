import { responseJSON } from "./request-guard.mjs";
import { env } from "cloudflare:workers";
import { DomainError } from "./errors.mjs";
import { mutate, readWorkspace } from "./workspace";
import {
  nearAccountOK,
  accountCode,
  accountBalanceDisplay,
  decimal,
  usdRaw,
  units,
  buildTransfer,
  nearHashOK,
  matchesNearTransaction,
  finalTransferEvidence,
  gasReserve,
} from "./near-core.mjs";
import { createHolderLookup } from "./holder-lookup.mjs";
const holderCandidates = createHolderLookup();
import { tokenRisk } from "./token-risk.mjs";
import { readContractControls } from "./contract-controls.mjs";
import { readRiskEvidence } from "./risk-evidence.mjs";
const runtime = env as unknown as Record<string, string>;
export function initialPorti() {
  return {
    watches: [],
    snapshots: {},
    alerts: [],
    messages: [],
    drafts: [],
    receipts: [],
    model: "zai-org/GLM-5.1-FP8",
    lastChat: 0,
  };
}
async function secretKey() {
  if (!runtime.PORTI_SETTINGS_KEY || runtime.PORTI_SETTINGS_KEY.length < 32)
    throw new DomainError(
      "SETUP_REQUIRED",
      "Secure settings are not configured.",
      503,
    );
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode("porti-settings-v1:" + runtime.PORTI_SETTINGS_KEY),
  );
  return crypto.subtle.importKey("raw", digest, "AES-GCM", false, [
    "encrypt",
    "decrypt",
  ]);
}
export async function encryptNear(value: string, id: string) {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const data = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv, additionalData: new TextEncoder().encode(id) },
    await secretKey(),
    new TextEncoder().encode(value),
  );
  return {
    iv: [...iv],
    data: btoa(String.fromCharCode(...new Uint8Array(data))),
  };
}
export async function decryptNear(value: any, id: string) {
  try {
    return new TextDecoder().decode(
      await crypto.subtle.decrypt(
        {
          name: "AES-GCM",
          iv: new Uint8Array(value.iv),
          additionalData: new TextEncoder().encode(id),
        },
        await secretKey(),
        Uint8Array.from(atob(value.data), (c) => c.charCodeAt(0)),
      ),
    );
  } catch {
    throw new DomainError(
      "SETTINGS_LOCKED",
      "Saved provider settings could not be opened. Reconnect the affected provider in Connections.",
      503,
    );
  }
}
export function safePorti(state: any) {
  const p = state.porti || initialPorti();
  return {
    watches: p.watches || [],
    snapshots: p.snapshots || {},
    alerts: p.alerts || [],
    drafts: p.drafts || [],
    receipts: p.receipts || [],
    walletRoles: p.walletRoles || {},
    model: p.model,
    messages: (p.messages || [])
      .filter((m: any) => m.role === "user" || m.role === "assistant")
      .map(({ tool_calls, ...m }: any) => m),
    aiConfigured: !!(p.aiKeyCipher || runtime.NEAR_AI_API_KEY),
    indexConfigured: !!(p.indexKeyCipher || runtime.NEARBLOCKS_API_KEY),
    rpcConfigured: !!(p.rpcCipher || runtime.NEAR_RPC_URL),
    network: "mainnet",
  };
}
export async function portiConfig(id: string, scope: string = "all") {
  const s = (await readWorkspace(id)).state,
    p = s.porti || initialPorti();
  return {
    p,
    aiKey: ["all", "ai"].includes(scope)
      ? p.aiKeyCipher
        ? await decryptNear(p.aiKeyCipher, id)
        : runtime.NEAR_AI_API_KEY || ""
      : "",
    indexKey: ["all", "index"].includes(scope)
      ? p.indexKeyCipher
        ? await decryptNear(p.indexKeyCipher, id)
        : runtime.NEARBLOCKS_API_KEY || ""
      : "",
    rpc: ["all", "rpc"].includes(scope)
      ? p.rpcCipher
        ? await decryptNear(p.rpcCipher, id)
        : runtime.NEAR_RPC_URL || "https://rpc.mainnet.near.org"
      : "",
  };
}
export function createRpcReadQueue(maxActive = 4, maxQueued = 64) {
  let active = 0;
  const waiting: Array<() => void> = [];
  return function queued<T>(work: () => Promise<T>): Promise<T> {
    return new Promise((resolve, reject) => {
      const run = () => {
        active++;
        Promise.resolve().then(work).then(resolve, reject).finally(() => {
          active--;
          waiting.shift()?.();
        });
      };
      if (active < maxActive) run();
      else if (waiting.length < maxQueued) waiting.push(run);
      else reject(new DomainError("RPC_BUSY", "NEAR reads are busy. Try again shortly.", 503));
    });
  };
}
const rpcReadQueue = createRpcReadQueue();
const rpcVerifications = new Map<string, Promise<void>>();
const rpcChecks = new Map<string, number>();
async function fetchJSON(
  url: string,
  init: RequestInit = {},
  label = "NEAR data",
): Promise<any> {
  try {
    const r = await fetch(url, {
      ...init,
      redirect: "manual",
      signal: AbortSignal.timeout(label === "NEAR AI Cloud" ? 40000 : 12000),
    });
    if (r.status === 429)
      throw new DomainError(
        "PROVIDER_RATE_LIMIT",
        `${label} is rate-limiting requests. Try again after one minute.`,
        503,
      );
    if (!r.ok)
      throw new DomainError(
        "PROVIDER_ERROR",
        `${label} returned HTTP ${r.status}. Check the connection and available credits.`,
        503,
      );
    return await responseJSON(r);
  } catch (e) {
    if (e instanceof DomainError) throw e;
    throw new DomainError(
      "PROVIDER_UNAVAILABLE",
      `${label} is unavailable. No live result was produced.`,
      503,
    );
  }
}
export async function nearRpc(id: string, method: string, params: any) {
  const { rpc } = await portiConfig(id, "rpc");
  return rpcReadAt(rpc, method, params);
}
async function rpcReadAt(rpc: string, method: string, params: any) {
  if (!["status", "query", "tx", "block", "gas_price"].includes(method))
    throw new DomainError("RPC_METHOD", "This RPC method is not allowed.");
  const call = async (name: string, args: any) => {
    const d = await rpcReadQueue(() => fetchJSON(
      rpc,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: crypto.randomUUID(),
          method: name,
          params: args,
        }),
      },
      "NEAR RPC",
    ));
    if (d.error || !d.result)
      throw new DomainError(
        "RPC_READ_FAILED",
        "The NEAR RPC could not complete this read. Check the account, contract or transaction.",
        400,
      );
    return d.result;
  };
  if (method !== "status" && Date.now() - (rpcChecks.get(rpc) || 0) > 60000) {
    if (!rpcVerifications.has(rpc)) {
      const check = (async () => {
        const status = await call("status", []);
        if (status.chain_id !== "mainnet")
          throw new DomainError(
            "WRONG_NETWORK",
            "This endpoint is not NEAR mainnet.",
          );
        if (rpcChecks.size >= 32) rpcChecks.delete(rpcChecks.keys().next().value!);
        rpcChecks.set(rpc, Date.now());
      })().finally(() => rpcVerifications.delete(rpc));
      rpcVerifications.set(rpc, check);
    }
    await rpcVerifications.get(rpc);
  }
  return call(method, params);
}
export function createInvestigationReader(rpc: string) {
  const fallback = "https://free.rpc.fastnear.com";
  const eligible = rpc === "https://rpc.mainnet.near.org" || rpc === "https://rpc.mainnet.near.org/";
  let usingFallback = false;
  const read = async (_id: string, method: string, params: any) => {
    if (usingFallback) return rpcReadAt(fallback, method, params);
    try { return await rpcReadAt(rpc, method, params); }
    catch (error: any) {
      if (!eligible || !["PROVIDER_RATE_LIMIT", "PROVIDER_UNAVAILABLE", "PROVIDER_ERROR", "RPC_READ_FAILED"].includes(error?.code)) throw error;
      // rpcReadAt validates the fallback's mainnet chain ID before a query.
      // Only default public reads use failover; configured private URLs stay private.
      const result = await rpcReadAt(fallback, method, params);
      usingFallback = true;
      return result;
    }
  };
  return {read, usedFallback: () => usingFallback};
}
export async function viewAccount(id: string, account: string, read = nearRpc) {
  if (!nearAccountOK(account))
    throw new DomainError(
      "INVALID_ACCOUNT",
      "Enter a NEAR mainnet account, such as alice.near, or its 64-character implicit address.",
    );
  return read(id, "query", {
    request_type: "view_account",
    finality: "final",
    account_id: account,
  });
}
export async function viewFunction(
  id: string,
  contract: string,
  method: string,
  args: any = {},
  read = nearRpc,
) {
  if (
    !nearAccountOK(contract) ||
    ![
      "ft_metadata",
      "ft_total_supply",
      "ft_balance_of",
      "storage_balance_of",
      "storage_balance_bounds",
    ].includes(method)
  )
    throw new DomainError("INVALID_VIEW", "This read method is not allowed.");
  const result = await read(id, "query", {
    request_type: "call_function",
    finality: "final",
    account_id: contract,
    method_name: method,
    args_base64: btoa(JSON.stringify(args)),
  });
  try {
    return JSON.parse(new TextDecoder().decode(new Uint8Array(result.result)));
  } catch {
    throw new DomainError(
      "INVALID_VIEW_RESULT",
      "The token contract returned an unsupported response.",
    );
  }
}
async function indexer(id: string, path: string) {
  const { indexKey } = await portiConfig(id, "index");
  return fetchJSON(
    "https://api.nearblocks.io/v3" + path,
    {
      headers: indexKey
        ? { Authorization: `Bearer ${indexKey}` }
        : { Accept: "application/json" },
    },
    "NearBlocks indexer",
  );
}
export async function tokenMetadata(id: string, token: string, read = nearRpc) {
  if (token === "near") return { symbol: "NEAR", name: "NEAR", decimals: 24 };
  const m = await viewFunction(id, token, "ft_metadata", {}, read);
  if (!m || !Number.isInteger(m.decimals) || m.decimals < 0 || m.decimals > 36)
    throw new DomainError(
      "INVALID_TOKEN",
      "The contract did not return valid NEP-148 metadata.",
    );
  return {
    symbol: String(m.symbol || "TOKEN").slice(0, 24),
    name: String(m.name || "Token").slice(0, 100),
    decimals: m.decimals,
  };
}
export async function tokenPrice(token: string) {
  if (token !== "near" && !nearAccountOK(token))
    throw new DomainError("INVALID_TOKEN", "Use a valid NEAR token account.");
  const coin =
    token === "near" || token === "wrap.near"
      ? "coingecko:near"
      : `near:${token}`;
  const data = await fetchJSON(
    "https://coins.llama.fi/prices/current/" + encodeURIComponent(coin),
    {},
    "USD price feed",
  );
  const p = data.coins?.[coin],
    now = Date.now() / 1000;
  if (
    !p ||
    !Number.isFinite(p.price) ||
    p.price <= 0 ||
    !Number.isFinite(p.timestamp) ||
    Math.abs(now - p.timestamp) > 300 ||
    (p.confidence !== undefined && p.confidence < 0.95)
  )
    throw new DomainError(
      "PRICE_UNAVAILABLE",
      "No sufficiently recent USD price is available for this token. Use an explicit token quantity instead.",
    );
  return { usd: p.price, timestamp: p.timestamp, source: "DefiLlama", coin };
}
export async function nearInvestigate(
  id: string,
  kind: string,
  account: string,
) {
  if (!nearAccountOK(account) || !["token", "wallet"].includes(kind))
    throw new DomainError(
      "INVALID_ACCOUNT",
      "Use a valid NEAR mainnet account or token contract.",
    );
  const { rpc } = await portiConfig(id, "rpc");
  const rpcReader = createInvestigationReader(rpc);
  const read = rpcReader.read;
  const warnings: string[] = [];
  if (kind === "wallet") {
    const a = await viewAccount(id, account, read);
    return {
      kind,
      address: account,
      network: "near-mainnet",
      checkedAt: Date.now(),
      source: "NEAR final RPC",
      metadata: {
        name: account,
        coin_balance: a.amount,
        locked: a.locked,
        storage_usage: a.storage_usage,
        is_contract: accountCode(a).isContract,
      },
      holders: [],
      transfers: [],
      balances: [],
      activity: [],
      warnings: [
        "Token inventory and historical transfers are not included in this RPC-only account observation.",
      ],
      coverage: "Final account state only; not full account history.",
    };
  }
  const [metadata, supply, contractControls] = await Promise.all([
    tokenMetadata(id, account, read),
    viewFunction(id, account, "ft_total_supply", {}, read),
    readContractControls(
      () => viewAccount(id, account, read),
      (blockHash: string) => read(id, "query", {request_type:"view_access_key_list", block_id:blockHash, account_id:account}),
    ),
  ]);
  if (typeof supply !== "string" || !/^\d+$/.test(supply))
    throw new DomainError(
      "INVALID_SUPPLY",
      "Token total supply was not a raw integer.",
    );
  const researchWork = () => readRiskEvidence(account, metadata, contractControls, (params: any) => read(id, "query", params));
  let holders: any[] = [];
  let holderLookupFailed = false;
  let holderAccessHint: string | null = null;
  let holderCandidatesAt: number | null = null;
  try {
    const candidates = await holderCandidates(id, account, () =>
      indexer(id, `/fts/${account}/holders?limit=30`),
    );
    holders = candidates.holders;
    holderCandidatesAt = candidates.fetchedAt;
  } catch (e: any) {
    holderLookupFailed = true;
    const { indexKey } = await portiConfig(id, "index");
    holderAccessHint = indexKey
      ? "Check the connected NearBlocks API key and its quota in Connections. Repeated retries cannot bypass provider limits."
      : "No NearBlocks API key is connected. Add a key in Connections for holder lookups; the shared public endpoint may remain blocked or rate-limited.";
    warnings.push(holderAccessHint);
    warnings.push(
      e instanceof DomainError
        ? e.message
        : e?.code === "PROVIDER_RATE_LIMIT"
          ? "NearBlocks holder lookups are cooling down after a rate limit. Try again after one minute."
          : "The holder response was not recognized.",
    );
  }
  // Re-read top-ten balances from finalized NEAR RPC instead of trusting an indexer amount unit.
  for (let offset = 0; offset < Math.min(10, holders.length); offset += 5) {
    await Promise.all(
      holders.slice(offset, offset + 5).map(async (h: any) => {
        try {
          const [balance, detail] = await Promise.all([
            viewFunction(id, account, "ft_balance_of", {
              account_id: h.address.hash,
            }, read),
            viewAccount(id, h.address.hash, read),
          ]);
          if (typeof balance !== "string" || !/^\d+$/.test(balance))
            throw new Error();
          h.value = balance;
          h.address.is_contract =
            accountCode(detail).isContract;
        } catch {
          warnings.push(
            "Some holder balances or contract types could not be confirmed at finality.",
          );
          h.address.is_contract = null;
          h.value = null;
        }
      }),
    );
  }
  // Only finalized, raw RPC-confirmed holder entries are safe for concentration calculations.
  const candidateCount = holders.length;
  holders = holders.slice(0, 10).filter((h: any) => h.value !== null);
  const holderStatus = holders.length
    ? "confirmed_sample"
    : holderLookupFailed || candidateCount
      ? "unavailable"
      : "no_candidates";
  const snapshot: any = {
    kind,
    address: account,
    network: "near-mainnet",
    checkedAt: Date.now(),
    source: "NEAR final RPC + NearBlocks holder candidates",
    metadata: { ...metadata, total_supply: supply, contract: null },
    holderStatus,
    holderCandidatesAt,
    holderAccessHint,
    holders,
    transfers: [],
    balances: [],
    activity: [],
    contractScan: null,
    contractControls,
    researchChecks: await researchWork(),
    rpcFallbackUsed: rpcReader.usedFallback(),
    warnings: [
      ...new Set(warnings),
      ...(rpcReader.usedFallback() ? ["Some official public RPC reads failed; validated FastNEAR mainnet RPC was used for this observation."] : []),
      "Holder candidates depend on indexer coverage; this is not a complete holder census.",
    ],
    coverage:
      "Up to 10 indexer holder candidates, with finalized RPC balance/type reads. Contract code-hash and account access keys are inspected at one finalized block where available. Contract roles and transfer relationships are not audited.",
  };
  snapshot.risk = tokenRisk(snapshot);
  return snapshot;
}
export async function saveObservation(id: string, snapshot: any) {
  const updated = await mutate(id, (s) => {
    s.porti ??= initialPorti();
    const p = s.porti,
      key = `${snapshot.kind}:${snapshot.address}`,
      previous = p.snapshots[key];
    let alert: any = null;
    if (snapshot.risk?.level === "high" && previous?.risk?.level !== "high") {
      alert = {
        id: crypto.randomUUID(),
        address: snapshot.address,
        label: "High concentration risk signals observed",
        createdAt: Date.now(),
        read: false,
      };
      p.alerts.unshift(alert);
    }
    p.snapshots[key] = snapshot;
    const entries = Object.entries(p.snapshots);
    if (entries.length > 35)
      delete p.snapshots[
        entries.sort((a: any, b: any) => a[1].checkedAt - b[1].checkedAt)[0][0]
      ];
    p.alerts = p.alerts.slice(0, 60);
    return { previous, alert };
  });
  try {
    const { enqueueTelegram, telegramBalanceEvent } = await import(
      "./telegram"
    );
    await telegramBalanceEvent(id, updated.result.previous, snapshot);
    if (updated.result.alert)
      await enqueueTelegram(id, {
        key: "risk:" + updated.result.alert.id,
        type: "concentration",
        text: `Porti concentration warning\n${snapshot.address}\nHigh concentration signals appeared in the available holder sample. This does not prove a rug. Liquidity, sellability and privileged functions remain unchecked.\nChecked: ${new Date(snapshot.checkedAt).toISOString()}\nhttps://nearblocks.io/address/${snapshot.address}`,
      });
  } catch {
    console.warn("Telegram observation enqueue unavailable");
  }
}
export async function addNearWatch(
  id: string,
  kind: string,
  account: string,
  label = "",
) {
  if (!nearAccountOK(account) || !["wallet", "token"].includes(kind))
    throw new DomainError(
      "INVALID_ACCOUNT",
      "Use a valid NEAR account or token contract.",
    );
  await mutate(id, (s) => {
    s.porti ??= initialPorti();
    const p = s.porti;
    if (p.watches.some((w: any) => w.address === account && w.kind === kind))
      return;
    if (p.watches.length >= 25)
      throw new DomainError(
        "WATCH_LIMIT",
        "This release supports 25 watched accounts and contracts.",
      );
    p.watches.unshift({
      id: crypto.randomUUID(),
      kind,
      address: account,
      label: label.slice(0, 50) || account,
      paused: false,
      addedAt: Date.now(),
    });
  });
  return { watched: true, kind, account };
}
export async function prepareNearTransfer(id: string, input: any) {
  const { sender, token } = input;
  const requestId =
    typeof input.requestId === "string" &&
    /^[a-zA-Z0-9-]{10,80}$/.test(input.requestId)
      ? input.requestId
      : null;
  const fingerprint = JSON.stringify([
    sender,
    input.recipient,
    token,
    input.amount,
    input.denomination,
  ]);
  if (requestId) {
    const prior = (await portiConfig(id, "state")).p.drafts.find(
      (d: any) => d.requestId === requestId,
    );
    if (prior) {
      if (prior.fingerprint !== fingerprint)
        throw new DomainError(
          "REQUEST_REUSED",
          "Prepare changed transfer details with a fresh request ID.",
          409,
        );
      return prior;
    }
  }
  let recipient = input.recipient,
    resolvedProfile: any = null;
  if (typeof recipient === "string" && recipient.startsWith("@")) {
    const { resolveUsername } = await import("./near-profile");
    resolvedProfile = await resolveUsername(recipient);
    recipient = resolvedProfile.wallet;
  }
  if (
    !nearAccountOK(sender) ||
    !nearAccountOK(recipient) ||
    sender === recipient ||
    (token !== "near" && !nearAccountOK(token))
  )
    throw new DomainError(
      "TRANSFER_INPUT",
      "Specify a connected sender, exact token contract/native near, and a different NEAR mainnet recipient.",
    );
  const metadata = await tokenMetadata(id, token);
  await viewAccount(id, recipient);
  const senderState = await viewAccount(id, sender);
  let price: any = null,
    raw: string;
  try {
    if (input.denomination === "usd") {
      price = await tokenPrice(token);
      raw = usdRaw(input.amount, price.usd, metadata.decimals);
    } else if (input.denomination === "token")
      raw = units(input.amount, metadata.decimals);
    else throw new Error("Choose usd or token amount denomination.");
  } catch (e: any) {
    if (e instanceof DomainError) throw e;
    throw new DomainError("TRANSFER_AMOUNT", e.message);
  }
  let storage = "0";
  if (token !== "near") {
    const [balance, registration] = await Promise.all([
      viewFunction(id, token, "ft_balance_of", { account_id: sender }),
      viewFunction(id, token, "storage_balance_of", { account_id: recipient }),
    ]);
    if (BigInt(balance) < BigInt(raw))
      throw new DomainError(
        "INSUFFICIENT_TOKEN",
        "The selected account does not have enough of this token.",
      );
    if (!registration) {
      const bounds = await viewFunction(id, token, "storage_balance_bounds");
      if (!bounds?.min || !/^\d+$/.test(bounds.min))
        throw new DomainError(
          "STORAGE_UNKNOWN",
          "Recipient storage registration cost could not be verified.",
        );
      storage = bounds.min;
    }
  }
  const quote = await nearRpc(id, "gas_price", [
      senderState.block_hash || null,
    ]),
    reserve = gasReserve(quote.gas_price, token, storage);
  const storageStaked =
      BigInt(senderState.storage_usage || 0) * BigInt("10000000000000000000"),
    spendable = BigInt(senderState.amount) - storageStaked - BigInt(reserve);
  if (
    spendable < (token === "near" ? BigInt(raw) : BigInt(storage) + BigInt(1))
  )
    throw new DomainError(
      "INSUFFICIENT_NEAR",
      "Insufficient available NEAR after preserving account storage and a buffered network gas reserve.",
    );
  let transaction;
  try {
    transaction = buildTransfer({
      sender,
      recipient,
      token,
      rawAmount: raw,
      decimals: metadata.decimals,
      storageDeposit: storage,
    });
  } catch (e: any) {
    throw new DomainError("TRANSFER_LIMIT", e.message);
  }
  const draft = {
    id: crypto.randomUUID(),
    requestId,
    fingerprint,
    network: "mainnet",
    sender,
    recipient,
    recipientUsername: resolvedProfile?.username || null,
    recipientVersion: resolvedProfile?.version || null,
    token,
    symbol: metadata.symbol,
    decimals: metadata.decimals,
    rawAmount: raw,
    amount: decimal(raw, metadata.decimals),
    requestedAmount: input.amount,
    denomination: input.denomination,
    price,
    gasReserve: reserve,
    storageDeposit: storage,
    transaction,
    createdAt: Date.now(),
    expiresAt: Date.now() + (price ? 60000 : 180000),
    status: "awaiting_review",
  };
  const saved = await mutate(id, (s) => {
    s.porti ??= initialPorti();
    const prior = requestId
      ? s.porti.drafts.find((d: any) => d.requestId === requestId)
      : null;
    if (prior) {
      if (prior.fingerprint !== fingerprint)
        throw new DomainError(
          "REQUEST_REUSED",
          "Transfer details changed.",
          409,
        );
      return prior;
    }
    if (
      s.porti.drafts.filter(
        (d: any) => d.status === "wallet_requested" || d.status === "submitted",
      ).length >= 10
    )
      throw new DomainError(
        "PENDING_TRANSFERS",
        "Verify pending wallet outcomes before preparing more transfers.",
      );
    s.porti.drafts.unshift(draft);
    s.porti.drafts = s.porti.drafts.filter(
      (d: any, i: number) =>
        i < 20 || ["wallet_requested", "submitted"].includes(d.status),
    );
    return draft;
  });
  return saved.result;
}
export async function validateNearDraft(id: string, draftId: string) {
  const p = (await portiConfig(id, "state")).p,
    d = p.drafts.find((x: any) => x.id === draftId);
  if (!d || d.status !== "awaiting_review" || d.expiresAt < Date.now())
    throw new DomainError(
      "DRAFT_EXPIRED",
      "This transfer review expired or was already submitted. Prepare a new transfer.",
    );
  if(d.charityCampaignId){const {assertDonationCampaign}=await import("./charity");await assertDonationCampaign(d.charityCampaignId,d.recipient,d.token);}
  if (d.recipientUsername) {
    const { resolveUsername } = await import("./near-profile");
    const profile = await resolveUsername(d.recipientUsername);
    if (
      profile.wallet !== d.recipient ||
      profile.version !== d.recipientVersion
    )
      throw new DomainError(
        "RECIPIENT_CHANGED",
        "The username’s wallet link changed. Prepare and review a fresh transfer.",
      );
  }
  if (d.price) {
    const fresh = await tokenPrice(d.token);
    if (Math.abs(fresh.usd / d.price.usd - 1) > 0.01)
      throw new DomainError(
        "PRICE_MOVED",
        "Price moved by more than 1%. Prepare a fresh transfer review.",
      );
  }
  await viewAccount(id, d.recipient);
  const state = await viewAccount(id, d.sender);
  if (
    d.token !== "near" &&
    BigInt(
      await viewFunction(id, d.token, "ft_balance_of", {
        account_id: d.sender,
      }),
    ) < BigInt(d.rawAmount)
  )
    throw new DomainError(
      "INSUFFICIENT_TOKEN",
      "Token balance changed. Prepare a new transfer.",
    );
  const quote = await nearRpc(id, "gas_price", [state.block_hash || null]),
    reserve = gasReserve(quote.gas_price, d.token, d.storageDeposit);
  const available =
    BigInt(state.amount) -
    BigInt(state.storage_usage || 0) * BigInt("10000000000000000000") -
    BigInt(reserve);
  if (
    available <
    (d.token === "near"
      ? BigInt(d.rawAmount)
      : BigInt(d.storageDeposit) + BigInt(1))
  )
    throw new DomainError(
      "INSUFFICIENT_NEAR",
      "Available NEAR changed. Prepare a new transfer.",
    );
  await mutate(id, (s) => {
    const current = s.porti.drafts.find((x: any) => x.id === draftId);
    if (
      !current ||
      current.status !== "awaiting_review" ||
      current.expiresAt < Date.now()
    )
      throw new DomainError(
        "DRAFT_ALREADY_REQUESTED",
        "This review was already sent to a wallet or expired. Check its outcome instead of submitting again.",
      );
    current.status = "wallet_requested";
    current.requestedAt = Date.now();
    current.gasReserve = reserve;
  });
  return {
    ...d,
    status: "wallet_requested",
    requestedAt: Date.now(),
    gasReserve: reserve,
  };
}
export async function reconcileNearTransfer(
  id: string,
  draftId: string,
  hash: string,
) {
  if (!nearHashOK(hash) || typeof draftId !== "string" || draftId.length > 80)
    throw new DomainError(
      "INVALID_HASH",
      "Use a valid NEAR transaction hash and transfer review.",
    );
  if (!env.DB)
    throw new DomainError(
      "STORAGE_UNAVAILABLE",
      "Receipt storage is unavailable.",
      503,
    );
  const stored: any = await env.DB.prepare(
    "SELECT draft_id,receipt FROM porti_transfer_receipts WHERE owner_id=? AND hash=?",
  )
    .bind(id, hash)
    .first();
  if (stored) {
    if (stored.draft_id !== draftId)
      throw new DomainError(
        "HASH_USED",
        "This hash belongs to another review.",
        409,
      );
    return JSON.parse(stored.receipt);
  }
  const { p } = await portiConfig(id, "state"),
    d = p.drafts.find((x: any) => x.id === draftId);
  if (
    !d ||
    !["wallet_requested", "submitted", "finalized"].includes(d.status) ||
    !Number.isFinite(d.requestedAt || d.createdAt)
  )
    throw new DomainError(
      "REVIEW_REQUIRED",
      "Approve a reviewed transfer in your wallet before verifying its outcome.",
    );
  if (d.hash && d.hash !== hash)
    throw new DomainError(
      "HASH_MISMATCH",
      "This review already has another transaction hash.",
      409,
    );
  const result = await nearRpc(id, "tx", {
    tx_hash: hash,
    sender_account_id: d.sender,
    wait_until: "FINAL",
  });
  if (!finalTransferEvidence(result, d, hash))
    throw new DomainError(
      "TRANSFER_UNVERIFIED",
      "Final execution and matching transfer evidence have not been verified. Keep the hash and check again; do not submit a replacement payment.",
    );
  const block = await nearRpc(id, "block", {
      block_id: result.transaction_outcome.block_hash,
    }),
    timestamp = Number(
      BigInt(
        block?.header?.timestamp_nanosec || block?.header?.timestamp || "0",
      ) / BigInt(1000000),
    );
  if (
    !Number.isSafeInteger(timestamp) ||
    timestamp < (d.requestedAt || d.createdAt) - 30000 ||
    timestamp > Date.now() + 30000
  )
    throw new DomainError(
      "TRANSACTION_TIME",
      "This transaction is outside this review’s submission window. Keep the original hash; no new payment was made by this check.",
    );
  const receipt = {
    draftId,
    hash,
    sender: d.sender,
    recipient: d.recipient,
    amount: d.amount,
    symbol: d.symbol,
    token: d.token,
    network: "mainnet",
    status: "finalized",
    verifiedAt: Date.now(),
    finality: "FINAL",
    evidence: d.token === "near" ? "native-transfer" : "nep141-transfer-event",
    blockHash: result.transaction_outcome.block_hash,
  };
  try {
    await env.DB.prepare(
      "INSERT INTO porti_transfer_receipts(id,owner_id,hash,draft_id,receipt,created_at) VALUES(?,?,?,?,?,?) ON CONFLICT(owner_id,hash) DO NOTHING",
    )
      .bind(
        crypto.randomUUID(),
        id,
        hash,
        draftId,
        JSON.stringify(receipt),
        Date.now(),
      )
      .run();
  } catch {
    throw new DomainError(
      "RECEIPT_CONFLICT",
      "A different transaction is already recorded for this review.",
      409,
    );
  }
  const committed: any = await env.DB.prepare(
    "SELECT draft_id,receipt FROM porti_transfer_receipts WHERE owner_id=? AND hash=?",
  )
    .bind(id, hash)
    .first();
  if (committed?.draft_id !== draftId)
    throw new DomainError(
      "HASH_USED",
      "This hash was recorded for another review.",
      409,
    );
  const saved = JSON.parse(committed.receipt);
  await mutate(id, (s) => {
    const p = s.porti,
      current = p.drafts.find((x: any) => x.id === draftId);
    if (!p.receipts.some((x: any) => x.hash === hash))
      p.receipts.unshift(saved);
    p.receipts = p.receipts.slice(0, 50);
    if (current) {
      current.status = "finalized";
      current.hash = hash;
    }
  });
  await notifyReceipt(id, saved);
  return saved;
}
export async function savePortiSettings(id: string, input: any) {
  if (input.action === "save-ai") {
    if (
      typeof input.key !== "string" ||
      input.key.length < 16 ||
      input.key.length > 500 ||
      /[\r\n]/.test(input.key)
    )
      throw new DomainError(
        "INVALID_KEY",
        "Enter a valid NEAR AI Cloud API key.",
      );
    const model = String(input.model || "zai-org/GLM-5.1-FP8");
    if (!/^[a-zA-Z0-9_.:/-]{3,100}$/.test(model))
      throw new DomainError(
        "INVALID_MODEL",
        "Use a model ID from the NEAR AI Cloud catalog.",
      );
    const data = await fetchJSON(
      "https://cloud-api.near.ai/v1/chat/completions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${input.key}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model,
          messages: [{ role: "user", content: "Reply OK." }],
          max_tokens: 32,
        }),
      },
      "NEAR AI Cloud",
    );
    if (!data.choices?.[0]?.message)
      throw new DomainError(
        "AI_RESPONSE",
        "The provider did not return a valid chat completion.",
      );
    await mutate(id, () => null);
    const cipher = await encryptNear(input.key, id);
    await mutate(id, (s) => {
      s.porti ??= initialPorti();
      s.porti.aiKeyCipher = cipher;
      s.porti.model = model;
    });
    return {
      message:
        "NEAR AI Cloud connected. A small verification request was completed.",
    };
  }
  if (input.action === "save-index") {
    if (
      typeof input.key !== "string" ||
      input.key.length < 10 ||
      input.key.length > 500 ||
      /[\r\n]/.test(input.key)
    )
      throw new DomainError("INVALID_KEY", "Enter a NearBlocks API key.");
    await fetchJSON(
      "https://api.nearblocks.io/v3/fts/wrap.near/holders?limit=1",
      { headers: { Authorization: `Bearer ${input.key}` } },
      "NearBlocks",
    );
    const cipher = await encryptNear(input.key, id);
    await mutate(id, (s) => {
      s.porti ??= initialPorti();
      s.porti.indexKeyCipher = cipher;
    });
    return { message: "NearBlocks key verified and saved securely." };
  }
  if (input.action === "save-rpc") {
    let url;
    try {
      url = new URL(input.url);
    } catch {
      throw new DomainError(
        "INVALID_RPC",
        "Enter a valid HTTPS NEAR mainnet RPC URL.",
      );
    }
    if (
      url.protocol !== "https:" ||
      url.username ||
      url.password ||
      url.hash ||
      url.port ||
      !(
        url.hostname === "rpc.mainnet.near.org" ||
        url.hostname === "free.rpc.fastnear.com" ||
        url.hostname.endsWith(".fastnear.com") ||
        url.hostname.endsWith(".near.quiknode.pro")
      )
    )
      throw new DomainError(
        "INVALID_RPC",
        "Use the official NEAR RPC, FastNEAR, or a NEAR QuickNode HTTPS endpoint.",
      );
    const d = await fetchJSON(
      url.href,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jsonrpc: "2.0",
          id: "porti-check",
          method: "status",
          params: [],
        }),
      },
      "NEAR RPC",
    );
    if (d.result?.chain_id !== "mainnet")
      throw new DomainError(
        "WRONG_NETWORK",
        "This endpoint is not NEAR mainnet.",
      );
    const cipher = await encryptNear(url.href, id);
    await mutate(id, (s) => {
      s.porti ??= initialPorti();
      s.porti.rpcCipher = cipher;
    });
    return { message: "NEAR mainnet RPC verified and saved securely." };
  }
  throw new DomainError("INVALID_SETTINGS", "Unknown connection action.");
}
export async function nearTool(
  id: string,
  name: string,
  args: any,
  context: any,
) {
  if (name === "investigate_token") {
    const snapshot = await nearInvestigate(id, "token", args.contract);
    await saveObservation(id, snapshot);
    return {
      card: { type: "report", snapshot },
      output: {
        contract: snapshot.address,
        metadata: snapshot.metadata,
        totalSupplyFormatted: `${decimal(snapshot.metadata.total_supply, snapshot.metadata.decimals)} ${snapshot.metadata.symbol}`,
        holderStatus: snapshot.holderStatus,
        holderCandidatesAt: snapshot.holderCandidatesAt,
        holderAccessHint: snapshot.holderAccessHint,
        contractControls: snapshot.contractControls,
        researchChecks: snapshot.researchChecks,
        top10: snapshot.holders.map((holder: any) => ({
          ...holder,
          balanceFormatted: `${decimal(holder.value, snapshot.metadata.decimals)} ${snapshot.metadata.symbol}`,
          rawUnit: "token base units",
          decimals: snapshot.metadata.decimals,
        })),
        risk: {
          level: snapshot.risk.level,
          flags: snapshot.risk.flags,
          observations: snapshot.risk.observations,
          unknowns: snapshot.risk.unknowns,
        },
        warnings: snapshot.warnings,
        source: snapshot.source,
        checkedAt: snapshot.checkedAt,
        checkedAtISO: new Date(snapshot.checkedAt).toISOString(),
      },
    };
  }
  if (name === "inspect_account") {
    const snapshot = await nearInvestigate(id, "wallet", args.account);
    await saveObservation(id, snapshot);
    return {
      card: { type: "account", snapshot },
      output: {
        account: snapshot.address,
        network: snapshot.network,
        checkedAt: snapshot.checkedAt,
        checkedAtISO: new Date(snapshot.checkedAt).toISOString(),
        source: snapshot.source,
        ...accountBalanceDisplay(snapshot.metadata.coin_balance, snapshot.metadata.locked),
        isContract: snapshot.metadata.is_contract,
        storageUsageBytes: snapshot.metadata.storage_usage,
        rawEvidence: {
          amount: snapshot.metadata.coin_balance,
          locked: snapshot.metadata.locked,
          unit: "yoctoNEAR",
        },
        coverage: snapshot.coverage,
        warnings: snapshot.warnings,
      },
    };
  }
  if (name === "watch_account") {
    return {
      output: await addNearWatch(
        id,
        args.kind,
        args.account,
        String(args.label || ""),
      ),
    };
  }
  if (name === "prepare_transfer") {
    if (!context.wallet)
      throw new DomainError(
        "WALLET_REQUIRED",
        "Connect your NEAR wallet before preparing a transfer.",
      );
    const draft = await prepareNearTransfer(id, {
      requestId: context.requestId,
      sender: context.wallet,
      recipient: args.recipient,
      token: args.tokenContract,
      amount: args.amount,
      denomination: args.denomination,
    });
    return {
      card: { type: "transfer", draft },
      output: {
        draftId: draft.id,
        status: "awaiting_user_review",
        sender: draft.sender,
        recipient: draft.recipient,
        token: draft.token,
        amount: draft.amount,
        symbol: draft.symbol,
        expiresAt: draft.expiresAt,
        note: "No transaction signed or submitted. The user must review the transfer card and approve in their wallet.",
      },
    };
  }
  throw new DomainError("UNKNOWN_TOOL", "This tool is not allowed.");
}
export { fetchJSON };

export async function recordSubmittedHash(
  id: string,
  draftId: string,
  hash: string,
) {
  if (!nearHashOK(hash))
    throw new DomainError("INVALID_HASH", "Invalid NEAR transaction hash.");
  await mutate(id, (s) => {
    const d = s.porti?.drafts.find((x: any) => x.id === draftId);
    if (!d)
      throw new DomainError("NOT_FOUND", "Transfer review not found.", 404);
    if (d.hash && d.hash !== hash)
      throw new DomainError(
        "HASH_MISMATCH",
        "This review already has a different transaction hash.",
      );
    if (!["wallet_requested", "submitted", "finalized"].includes(d.status))
      throw new DomainError(
        "DRAFT_STATUS",
        "Wallet approval has not been requested for this review.",
      );
    d.hash = hash;
    if (d.status !== "finalized") d.status = "submitted";
  });
  return {
    message: "Transaction hash saved. Final outcome still needs verification.",
  };
}

async function notifyReceipt(id: string, r: any) {
  try {
    const { enqueueTelegram } = await import("./telegram");
    await enqueueTelegram(id, {
      key: "receipt:" + r.hash,
      type: "receipt",
      text: `Porti verified transfer\n${r.amount} ${r.symbol}\nFrom: ${r.sender}\nTo: ${r.recipient}\nFinalized on NEAR and matched to the reviewed transfer.\nhttps://nearblocks.io/txns/${r.hash}`,
    });
  } catch {
    console.warn("Telegram receipt enqueue unavailable");
  }
}




