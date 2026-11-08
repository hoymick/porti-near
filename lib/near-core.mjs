export const NEAR_NETWORK = "mainnet";
export const NEAR_EXPLORER = "https://nearblocks.io";
export const nearAccountOK = (v) =>
  typeof v === "string" &&
  v.length >= 2 &&
  v.length <= 64 &&
  /^(([a-z\d]+[-_])*[a-z\d]+\.)*([a-z\d]+[-_])*[a-z\d]+$/.test(v) &&
  !v.endsWith(".testnet") &&
  !v.startsWith("0x");
export const nearHashOK = (v) =>
  typeof v === "string" && /^[1-9A-HJ-NP-Za-km-z]{43,44}$/.test(v);
export function units(value, decimals) {
  if (
    !Number.isInteger(decimals) ||
    decimals < 0 ||
    decimals > 36 ||
    typeof value !== "string" ||
    !/^\d+(\.\d+)?$/.test(value) ||
    value.length > 90
  )
    throw new Error("Use a positive decimal amount.");
  const [whole, fraction = ""] = value.split(".");
  if (fraction.length > decimals)
    throw new Error(`This token supports ${decimals} decimal places.`);
  const result =
    BigInt(whole) * BigInt(10) ** BigInt(decimals) +
    BigInt(fraction.padEnd(decimals, "0") || "0");
  if (result <= BigInt(0) || result > BigInt(2) ** BigInt(128) - BigInt(1))
    throw new Error("Amount is outside the supported token range.");
  return result.toString();
}
export function decimal(raw, decimals) {
  try {
    const v = BigInt(raw),
      negative = v < BigInt(0),
      s = (negative ? -v : v).toString().padStart(decimals + 1, "0"),
      f = decimals ? s.slice(-decimals).replace(/0+$/, "") : "";
    return (
      (negative ? "-" : "") +
      s.slice(0, s.length - decimals) +
      (f ? "." + f : "")
    );
  } catch {
    return "Unknown";
  }
}
export function accountBalanceDisplay(amount, locked) {
  if (![amount, locked].every(value => typeof value === "string" && /^\d+$/.test(value)))
    throw new Error("Account balances must be raw yoctoNEAR integers.");
  return {
    balanceFormatted: decimal(amount, 24) + " NEAR",
    lockedFormatted: decimal(locked, 24) + " NEAR",
    rawUnit: "yoctoNEAR",
    decimals: 24,
  };
}
export function usdRaw(usd, price, decimals) {
  const cents = BigInt(units(usd, 2));
  if (cents > BigInt(10000))
    throw new Error("Porti currently limits each USD-valued transfer to $100.");
  if (!Number.isFinite(price) || price <= 0 || price > 1e12)
    throw new Error("A valid price is required.");
  const p = BigInt(Math.round(price * 1e8));
  if (p <= BigInt(0))
    throw new Error("Price is below the supported valuation precision.");
  const raw =
    (cents * BigInt(10) ** BigInt(decimals) * BigInt(100000000)) /
    (BigInt(100) * p);
  if (raw <= BigInt(0) || raw > BigInt(2) ** BigInt(128) - BigInt(1))
    throw new Error("USD value cannot be represented in this token’s units.");
  return raw.toString();
}
export function buildTransfer({
  sender,
  recipient,
  token,
  rawAmount,
  decimals,
  storageDeposit = "0",
}) {
  if (
    !nearAccountOK(sender) ||
    !nearAccountOK(recipient) ||
    sender === recipient
  )
    throw new Error(
      "Use distinct valid NEAR mainnet sender and recipient accounts.",
    );
  if (token !== "near" && !nearAccountOK(token))
    throw new Error("Use native near or a NEAR token contract account.");
  if (
    !/^\d+$/.test(rawAmount) ||
    BigInt(rawAmount) <= BigInt(0) ||
    BigInt(rawAmount) > BigInt(2) ** BigInt(128) - BigInt(1)
  )
    throw new Error("Invalid transfer amount.");
  if (
    !/^\d+$/.test(storageDeposit) ||
    BigInt(storageDeposit) > BigInt("100000000000000000000000")
  )
    throw new Error("Storage deposit must not exceed 0.1 NEAR.");
  if (token === "near") {
    if (decimals !== 24) throw new Error("Native NEAR uses 24 decimals.");
    if (BigInt(rawAmount) > BigInt("100000000000000000000000000"))
      throw new Error(
        "Native-token transfers are capped at 100 NEAR per request.",
      );
    return {
      signerId: sender,
      receiverId: recipient,
      actions: [{ type: "Transfer", params: { deposit: rawAmount } }],
    };
  }
  const actions = [];
  if (BigInt(storageDeposit) > BigInt(0))
    actions.push({
      type: "FunctionCall",
      params: {
        methodName: "storage_deposit",
        args: { account_id: recipient, registration_only: true },
        gas: "30000000000000",
        deposit: storageDeposit,
      },
    });
  actions.push({
    type: "FunctionCall",
    params: {
      methodName: "ft_transfer",
      args: {
        receiver_id: recipient,
        amount: rawAmount,
        memo: "Porti · reviewed transfer",
      },
      gas: "30000000000000",
      deposit: "1",
    },
  });
  return { signerId: sender, receiverId: token, actions };
}
export function parseHolders(payload) {
  const rows = Array.isArray(payload?.data)
    ? payload.data
    : Array.isArray(payload?.holders)
      ? payload.holders
      : null;
  if (!rows) throw new Error("Holder response format was not recognized.");
  const clean = rows
    .slice(0, 50)
    .map((h) => ({
      address: { hash: h.account_id, is_contract: null },
      value: h.amount ?? h.balance,
    }))
    .filter(
      (h) =>
        nearAccountOK(h.address.hash) &&
        typeof h.value === "string" &&
        /^\d+$/.test(h.value),
    );
  if (rows.length && !clean.length)
    throw new Error("No valid raw holder balances were returned.");
  return clean;
}
const canonical = (v) =>
  JSON.stringify(v, (_, x) =>
    x && typeof x === "object" && !Array.isArray(x)
      ? Object.fromEntries(
          Object.entries(x).sort(([a], [b]) => a.localeCompare(b)),
        )
      : x,
  );
export function matchesNearTransaction(tx, draft) {
  if (
    tx?.signer_id !== draft.sender ||
    tx?.receiver_id !== draft.transaction.receiverId
  )
    return false;
  const a = tx.actions,
    b = draft.transaction.actions;
  if (!Array.isArray(a) || a.length !== b.length) return false;
  return b.every((wanted, i) => {
    const actual = a[i];
    if (wanted.type === "Transfer")
      return String(actual?.Transfer?.deposit) === wanted.params.deposit;
    const f = actual?.FunctionCall;
    if (
      f?.method_name !== wanted.params.methodName ||
      String(f.deposit) !== wanted.params.deposit ||
      String(f.gas) !== wanted.params.gas
    )
      return false;
    try {
      return (
        canonical(
          JSON.parse(
            new TextDecoder().decode(
              Uint8Array.from(atob(f.args), (c) => c.charCodeAt(0)),
            ),
          ),
        ) === canonical(wanted.params.args)
      );
    } catch {
      return false;
    }
  });
}
// A successful top-level status alone is insufficient for asynchronous NEAR execution.
export function finalTransferEvidence(result, draft, hash) {
  if (
    result?.final_execution_status !== "FINAL" ||
    result.transaction?.hash !== hash ||
    result.transaction_outcome?.id !== hash ||
    !matchesNearTransaction(result.transaction, draft)
  )
    return false;
  const root = result.transaction_outcome,
    receipts = result.receipts_outcome;
  if (
    !Array.isArray(receipts) ||
    receipts.length === 0 ||
    receipts.length > 500 ||
    typeof result.status?.SuccessValue !== "string"
  )
    return false;
  const ids = new Set(receipts.map((r) => r?.id));
  if (ids.size !== receipts.length || receipts.some((r) => !nearHashOK(r?.id)))
    return false;
  for (const item of [root, ...receipts]) {
    const o = item?.outcome,
      s = o?.status;
    if (
      !o ||
      !Array.isArray(o.receipt_ids) ||
      o.receipt_ids.some((id) => !ids.has(id)) ||
      !s ||
      Object.keys(s).length !== 1
    )
      return false;
    if ("SuccessReceiptId" in s) {
      if (!ids.has(s.SuccessReceiptId)) return false;
    } else if (typeof s.SuccessValue !== "string") return false;
  }
  if (draft.token === "near") return true;
  // Require the token contract's standardized transfer event, not a successful no-op call.
  return receipts.some(
    (r) =>
      r.outcome?.executor_id === draft.token &&
      Array.isArray(r.outcome.logs) &&
      r.outcome.logs.some((line) => {
        if (
          typeof line !== "string" ||
          !line.startsWith("EVENT_JSON:") ||
          line.length > 20000
        )
          return false;
        try {
          const e = JSON.parse(line.slice(11).trim());
          return (
            e.standard === "nep141" &&
            e.event === "ft_transfer" &&
            Array.isArray(e.data) &&
            e.data.some(
              (d) =>
                d.old_owner_id === draft.sender &&
                d.new_owner_id === draft.recipient &&
                d.amount === draft.rawAmount,
            )
          );
        } catch {
          return false;
        }
      }),
  );
}
export function gasReserve(gasPrice, token = "near", storage = "0") {
  if (
    typeof gasPrice !== "string" ||
    !/^\d{1,19}$/.test(gasPrice) ||
    BigInt(gasPrice) <= BigInt(0)
  )
    throw new Error("A valid network gas price is required.");
  const gas =
    token === "near"
      ? BigInt("1000000000000")
      : BigInt("1000000000000") +
        BigInt("30000000000000") * (storage === "0" ? BigInt(1) : BigInt(2));
  const reserve = gas * BigInt(gasPrice) * BigInt(2),
    minimum = BigInt("2000000000000000000000");
  return (reserve > minimum ? reserve : minimum).toString();
}
