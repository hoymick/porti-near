# Porti Pocket (USSD)

A small, capped NEAR account that a phone can spend from over USSD. The contract enforces the caps; the main wallet keeps full control.

| Level | Who | Can do |
| --- | --- | --- |
| 1 | Porti AI | Propose only. Holds no key. |
| 2 | Pocket key (Porti server, function-call key) | `send` within per-transaction and daily caps; `freeze`. |
| 3 | Owner (main wallet, full-access key) | `withdraw` (also while frozen), `unfreeze`, `set_limits`, `freeze`. |

**Blast radius:** the server holds a key that can call `send` on every pocket. If the server is compromised, the contract bounds principal spending by each pocket’s remaining daily cap per UTC day, per-send cap and available balance. An attacker can spend again on later days until frozen/disabled or depleted, and function-call allowance can also be consumed. This is not a lifetime loss cap or an independent security audit. The restricted key does not grant main-wallet access.

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

- Only one `send` in flight per pocket at a time. The access-key nonce has to increase, so sends are serialized per pocket (a 15 s lock, released as soon as the outcome is final).
- The server signs with `PORTI_POCKET_KEY` (an `ed25519:` secret set as a Worker secret; its public key is the one each pocket adds in its setup transaction).
- Submit with `send_tx` and `wait_until: EXECUTED_OPTIMISTIC`, capped at 8 s, so the user hears the real outcome. On a timeout the session ends with "Submitted" and the hash, and the send is never retried. Reconcile and SMS receipts come next.

## USSD Send flow

`2` → `Send to @username:` → a verified Porti username → `Amount in NEAR (max X):`, where X = min(per-send cap, today left, spendable) → `Send X NEAR to @user? <wallet> Enter PIN to confirm / 0. Cancel` → PIN → `Sent X NEAR to @user. Ref: <hash>`.

- The recipient wallet and amount are saved in the session at the confirm screen. A username that moves to another wallet mid-session doesn't change the send.
- The session is claimed (deleted) before signing, so a replayed or duplicated final request can't send twice.
- PINs are PBKDF2-SHA256 hashes with a per-number salt. Three wrong PINs lock sending for 15 minutes, while Balance keeps working. A number without a PIN can't send.
- Contract refusals (frozen, over a cap, insufficient balance, a failed transfer that was refunded) are reported in plain words.

## Last 3 sends and Freeze

- **3. Last 3 sends:** reads `ussd_sends` for this number. Every send attempt is recorded with its outcome (`sent`, `refused`, `pending`), and the list shows `sent` and `pending` (marked "submitted").
- **4. Freeze pocket:** confirm with `1`, and the pocket key calls `freeze()`. No PIN is needed: freezing only makes the pocket safer and has to be quick for a lost phone. It also works while sending is PIN-locked. Only the main wallet can `unfreeze`.

## Networks

| Channel | Network | Key | Recipients |
| --- | --- | --- | --- |
| `live` (`/api/ussd`, a real phone line) | NEAR mainnet (`PORTI_USSD_RPC`, default `rpc.mainnet.near.org`) | `PORTI_POCKET_KEY` | Verified Porti usernames |
| `simulator` (`/api/ussd/sim`, +999 numbers) | NEAR testnet (`PORTI_SIM_RPC`, default `rpc.testnet.near.org`) | `PORTI_SIM_POCKET_KEY` | `PORTI_SIM_RECIPIENTS` (`bob=porti-bob-….testnet`) |

Both channels check the chain ID of their RPC.

## Public testnet demo

`npm run pocket:testnet` (once) creates a demo owner and `@bob` from the testnet faucet, then runs the real setup transaction. The pocket gets 6 test NEAR, 0.5 per send and 2 per day. The keys go to `.wrangler/pocket-testnet.json` (gitignored). The script prints the Worker settings: `PORTI_SIM_POCKET`, `PORTI_SIM_RECIPIENTS` and the secrets `PORTI_SIM_POCKET_KEY` and `PORTI_SIM_OWNER_KEY`. Add `--dev` to point local `.dev.vars` at it.

- Each visitor's browser picks its own +999 number. On first dial, the number links itself to `PORTI_SIM_POCKET` with the demo PIN (`PORTI_SIM_PIN`, default `1234`), so each number has its own PIN lockout and history. Real numbers are never linked automatically.
- **Demo-only unfreeze:** a minute after a visitor freezes the shared pocket, the server calls the owner-only `unfreeze()` with `PORTI_SIM_OWNER_KEY`, the testnet demo owner. This exists so one visitor can't block everyone. It runs only on the simulator channel; mainnet pockets are only ever unfrozen by their owner's wallet.

## Local sandbox

`npm run pocket:sandbox` runs the same setup on a private local chain. It links `+999000001` (PIN `1234`), sets `@bob → bob.sandbox`, and writes the `PORTI_SIM_*` settings to `.dev.vars`. Restart `npm run dev` afterwards.

## Proposed receipt-reconciliation interface (not implemented)

The following design is a future integration contract, not exported functions currently called by the USSD handler. Current submission waits for optimistic execution and records pending hashes; later FINAL receipt reconciliation remains unfinished.

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

The current implementation pins the resolved recipient at confirmation; it does not implement the proposed mapping-version reconciliation interface above.

## USSD endpoints

| Route | Caller | Auth | Phones |
| --- | --- | --- | --- |
| `POST /api/ussd?token=…` | Africa's Talking callback | `PORTI_USSD_TOKEN` (24+ chars, constant-time compare) | Real numbers only. `+999…` is refused. |
| `POST /api/ussd/sim` | Porti simulator widget, curl | None (public). Rate-limited per phone (30/min) and per IP (60/min) | `+999…` test numbers only |

Both routes are exempt from Cloudflare Access, and only those two exact paths are. Any forged `oai-*`, `x-porti-*` or Access headers are stripped, so the handler never sees an identity. Both routes accept Africa's Talking form fields (`sessionId`, `serviceCode`, `phoneNumber`, `text`) or the same fields as JSON, and reply in `text/plain` with `CON …` or `END …` (at most 182 characters).

A phone only reaches a pocket through a `ussd_phones` row on the same channel (`simulator` or `live`). A session is bound to one phone and one channel, and expires after 3 minutes.

Optional: set `PORTI_USSD_RPC` to use a mainnet RPC other than `https://rpc.mainnet.near.org`. The chain ID is still verified.

## Local testing (no mainnet, no NEAR spent)

A local NEAR sandbox runs the real contract and the real one-transaction setup:

```sh
(cd contracts/pocket && cargo near build non-reproducible-wasm)
npm run db:local -- migrate        # local D1 starts empty: apply migrations once
npm run pocket:sandbox             # chain on 127.0.0.1:3030, creates alice / pocket.alice / bob,
                                   # links +999000001 -> pocket.alice.sandbox; keep it running
npm run dev                        # restart after changing .dev.vars
npm run pocket:check               # server key: in-cap send ok; over-cap, withdraw, set_limits refused
curl -X POST http://127.0.0.1:5173/api/ussd/sim \
  -d 'sessionId=s1&serviceCode=*384*1%23&phoneNumber=%2B999000001&text='    # menu
curl -X POST http://127.0.0.1:5173/api/ussd/sim \
  -d 'sessionId=s1&serviceCode=*384*1%23&phoneNumber=%2B999000001&text=1'   # balance
```

A loopback `PORTI_SIM_RPC` skips the chain-ID check **in dev builds only**. Production simulator builds require testnet; live builds require mainnet. Sandbox keys go to `.wrangler/pocket-sandbox.json`, which is gitignored and has `0600` permissions.

Verified on the sandbox: the setup batch leaves the pocket with only the server's function-call key (`send`, `freeze`). With that key, a 0.05 send succeeds, a 0.2 send is refused by the per-tx cap, `withdraw` and `set_limits` are refused by the key's method list, and attaching 1 yocto is refused for function-call keys. USSD Balance reflects the spend immediately.
