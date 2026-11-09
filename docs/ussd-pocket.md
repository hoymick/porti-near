# Porti Pocket (USSD)

A small, capped NEAR account that a phone can spend from over USSD. The contract enforces the caps; the main wallet keeps full control.

| Level | Who | Can do |
| --- | --- | --- |
| 1 | Porti AI | Propose only. Holds no key. |
| 2 | Pocket key (Porti server, function-call key) | `send` within per-transaction and daily caps; `freeze`. |
| 3 | Owner (main wallet, full-access key) | `withdraw` (also while frozen), `unfreeze`, `set_limits`, `freeze`. |

**Blast radius:** the server holds a key that can call `send` on every pocket. If the server is compromised, each pocket can lose at most its remaining daily cap. The main wallet is never exposed.

## Contract (`contracts/pocket`)

Rust, `near-sdk` 5.30.1, Rust 1.95.0 pinned in `rust-toolchain.toml`.

```sh
cd contracts/pocket
cargo test                              # 25 unit tests
cargo near build non-reproducible-wasm  # target/near/porti_pocket.wasm (~135 KB)
```

| Method | Caller | Notes |
| --- | --- | --- |
| `new(owner_id, per_tx_cap, daily_cap)` | The pocket or its parent account | `#[init]`; call it in the setup batch so nobody else can claim ownership. |
| `send(receiver_id, amount)` | The pocket itself (via its key) | Checks frozen, `amount ≤ per_tx_cap`, `spent_today + amount ≤ daily_cap` (resets each UTC day), and `amount ≤ available`. |
| `on_send(...)` | Private callback | If the transfer failed, the day's spend is rolled back and a `send_failed` event is emitted. |
| `freeze()` | The pocket or the owner | |
| `unfreeze()`, `set_limits(per_tx_cap, daily_cap)`, `withdraw(amount?)` | Owner, with 1 yoctoNEAR attached | The deposit forces a full-access key. `withdraw` with no amount takes everything available. |
| `get_pocket()` | View | Returns `owner_id`, caps, `spent_today`, `remaining_today`, `available_balance`, `day_index` and `frozen` (rolled to today). |

Amounts are yoctoNEAR strings. `available = balance − storage staking − 0.05 NEAR gas reserve`.

Events use NEP-297 (`EVENT_JSON:`), with `standard: "porti_pocket"` and `version: "1.0.0"`:
`send`, `send_failed`, `freeze`, `unfreeze`, `set_limits`, `withdraw`.

## Setup transaction

One transaction, signed by `alice.near`, with receiver `pocket.alice.near`:

1. `CreateAccount`
2. `Transfer`: the pocket balance, plus storage and the 0.05 NEAR gas reserve
3. `UseGlobalContract` (recommended: about 135 KB of code costs about 1.35 NEAR in storage when deployed per pocket), or `DeployContract`
4. `FunctionCall new({owner_id: "alice.near", per_tx_cap, daily_cap})`
5. `AddKey(server_public_key, FunctionCall { receiver_id: "pocket.alice.near", method_names: ["send", "freeze"], allowance })`

The pocket has **no full-access key**, so the owner controls it only through the contract. When the key's gas allowance runs out, the owner has to add the key again.

Requires a named parent account. Porti's implicit device wallets can't create `pocket.<hex>`, so test this before building web setup.

## Server rules

- Only one `send` in flight per pocket at a time. The access-key nonce has to increase, so serialize sends per pocket.
- Submit with `broadcast_tx_async`, end the USSD session, then reconcile and send the SMS asynchronously. Never wait for finality inside a session.
- Store the pocket key encrypted, following the existing `PORTI_SETTINGS_KEY` pattern.

## Service seam (Michael ↔ Jeff)

Jeff's USSD code calls these functions. Michael owns them, built on existing Porti code.

```ts
// Already exists: lib/near-profile.ts. Throws DomainError INVALID_USERNAME / USERNAME_NOT_FOUND.
resolveUsername(value: string): Promise<{ username: string; wallet: string; verifiedAt: number; version: number }>;

// New. Pure validation, no I/O beyond reading pocket state.
validatePocketDraft(input: {
  pocketId: string;          // pocket.alice.near
  receiverId: string;        // from resolveUsername().wallet
  amount: string;            // yoctoNEAR, exact
  mappingVersion: number;    // resolveUsername().version, pinned at the confirm screen
}): Promise<{ draftId: string; receiverId: string; amount: string; expiresAt: number }>;

// New, modelled on reconcileNearTransfer(). Idempotent per hash.
reconcilePocketReceipt(draftId: string, hash: string): Promise<
  | { status: "final_success"; receiverId: string; amount: string; blockTimestamp: number }
  | { status: "final_failed"; reason: "refused" | "transfer_failed" }
  | { status: "pending" }
>;
```

Success evidence for a pocket send: `final_execution_status === "FINAL"`, signer and receiver are both the pocket, the action is a `send` FunctionCall with the exact draft args, the logs contain the `send` event, the transfer receipt to `receiverId` succeeded, and there is **no** `send_failed` event.

If the username's mapping `version` changed between the confirm screen and submission, refuse the send.
