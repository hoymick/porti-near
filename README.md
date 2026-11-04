# Porti — Your NEAR Companion

Current primary product: NEAR AI Cloud chat, final NEAR account/token reads, holder investigations, Profile @username wallet links, and human-approved transfer reviews. See [v0.6 implementation and limits](docs/near-porti-v06.md).

Use Connections to verify the NEAR AI Cloud key, optional NearBlocks key and a NEAR mainnet RPC. No inference credential or funded user wallet is bundled.

Checks: `npx tsc --noEmit` and `node --test tests/near.test.mjs tests/scout.test.mjs tests/token-risk.test.mjs`. Production packaging uses the Sites build helper. Profiles are created by appended migration `0001_flat_ultimatum.sql`; hosted migrations apply on publication.

## Retained v0.5 and earlier groundwork

# WIF PORT Scout

Current product: onchain scouting and trade planning for Robinhood Chain. See [v0.4 scope and operational limits](docs/scout-v04.md). The homepage no longer runs the document demo.

## Current setup

Use the authenticated Data connection screen to verify and encrypt a Blockscout Pro API key. A chain-4663 RPC is needed for WIF Pass balance checks. Never commit credentials. The app is owner-private.

Run `npx tsc --noEmit` and `node --test tests/scout.test.mjs` for current feature checks. Use the Sites build helper for production packaging.

## Legacy document / vault groundwork

The following describes retained v0.3 source. It is not the current scout UI and is not used to submit trading orders.

# WIF PORT

A friendly document-workflow agent with controlled service spending. Version 0.3 has a private demo workspace and a separate wallet-controlled purchase path for WIF on Robinhood Chain.

## Use the app

Home uses simulated test credits. Give Porti two documents, set a cap and run extraction, comparison and reporting. Import TXT, Markdown or text PDFs. Sample PDFs are built into the task form. Download the result as JSON or a standalone HTML report.

Wallet & vault is the real-token flow. Connect explicitly, check the service connection, verify the network and expected token, deploy or attach a matching vault, approve an exact amount and deposit separately. Authorize a memory-only session agent, then review the gas-paying transactions for each service purchase. No action connects or spends automatically.

The user supplied Pudgy Penguins as a design reference. The app uses Fredoka and Nunito, soft pastel surfaces, outlined controls and an original anime guide. No affiliation with Pudgy Penguins or Robinhood Markets is claimed.

## Boundaries

- No real network deployment or WIF payment has been executed by the assistant. The purchase implementation is tested locally; mainnet acceptance requires the user's wallet and assets.
- Comparison is deterministic normalized-text and word-overlap matching, not a connected language model. The offered model connection was declined. Reports disclose this method.
- Text PDFs are supported up to 3 MB, 20 pages and 30,000 characters. OCR, encrypted PDFs and documents over 200 extracted passages are not supported.
- The gateway requires the signed-in owner's browser session. No public API-key scheme or unattended agent execution is claimed.
- A session key stays in browser memory and clears on reload. Existing transactions and reservations can be recovered, but new purchases for an older task may require its original tab.
- The vault is unaudited. Delivery is approved by a service attestor; payment receipts do not prove semantic correctness.

## Architecture

- `app/workspace.tsx`: demo dashboard, task coordinator, PDFs and export controls.
- `app/wallet-panel.tsx`: explicit wallet actions, live task coordination and recovery.
- `app/api/workspace/route.ts`: authenticated demo commands.
- `app/api/tasks/[id]/advance/route.ts`: reserve, execute and settle one demo service.
- `app/api/live/route.ts`: private signed-quote and delivery gateway.
- `lib/engine.mjs`: integer demo ledger and deterministic services.
- `lib/store.mjs`: persistent revision-checked D1 updates.
- `lib/live-server.ts`: provider signatures, RPC access and chain reconciliation.
- `lib/documents.mjs`: browser-local PDF extraction and escaped HTML report generation.
- `contracts/WifBudgetVault.sol`: owner-controlled ERC20 budget vault.
- `contracts/TestToken.sol`: local testing only; never a canonical WIF token.
- `sdk/client.mjs`: browser-session sandbox client.
- `sdk/authorization.mjs`: EIP-712 quote, delivery and cancellation schemas.
- `sdk/vault-code.mjs`: runtime bytecode comparison with compiler-defined immutable slots normalized.
- `db/schema.ts` and `drizzle/`: schema-owned migrations.

## Run checks

Use Node 22.13 or newer and the repository lockfile.

```
npm ci
node node_modules/typescript/bin/tsc --noEmit
node --test tests/engine.test.mjs tests/store.test.mjs tests/documents.test.mjs
node --test tests/contracts.test.mjs
npm run build
```

Contract tests compile with solc and execute on an in-process Ganache EVM. They use local test accounts only. A native uWS compatibility warning may fall back to JavaScript without affecting correctness.

The stored client artifact must match the current compiler settings and contract source. Regenerate ABI, creation bytecode, runtime bytecode and immutable references with `compileContracts()` in `scripts/compile-contracts.mjs` after contract changes. Never silently attach a different contract implementation.

## Runtime configuration

`WIF_PROVIDER_KEY`, `WIF_ATTESTOR_KEY` and `WIF_FEE_KEY` are distinct service keys stored as runtime secrets, never repository files or browser code. `ROBINHOOD_RPC_URL` optionally overrides the rate-limited official public endpoint.

Alternatively, the authenticated owner can enter a provider endpoint from Alchemy, QuickNode or Chainstack in Wallet & vault. Only approved HTTPS provider hostnames are accepted. The URL is AES-GCM encrypted with owner-specific authenticated data before D1 persistence and never returned to the browser. RPC errors are sanitized to avoid revealing embedded credentials. Rotating the attestor key requires migrating encrypted endpoint records and coordinating vault policies.

The network configuration is taken from `https://docs.robinhood.com/chain/connecting/`. The expected WIF address comes from `https://worldisflat.fun/`. Both browser and gateway verify network and token metadata. Live setup is gated behind a successful service connection check.

## Spending and payment integrity

The demo uses integer millionths of a test credit. The vault uses the actual token's verified integer base units. Never use floating-point amounts for token debits.

Each vault has one immutable owner, token and fee recipient. The owner controls funding, withdrawal of available funds, service permissions, agent authorization and task caps. Daily and lifetime caps are vault-wide; per-call limits and allowlists are agent-specific.

Provider and agent signatures bind the job, task, service version identifier, salted request digest, destination, amounts, authorization version and deadlines. Reservations count against limits immediately. Cancellation or expiry restores the original day's reservation usage. Settled spending remains consumed. Provider and platform proceeds use pull withdrawals to their exact credited addresses.

The owner-selected attestor is snapshotted at reservation. Signed delivery and cancellation can be relayed without giving the relayer withdrawal authority. The contract limits the included platform fee to 2% of the quoted total. A replaced attestor cannot seize existing reservations.

The gateway checks onchain job state before delivery. Unsettled output is hidden from the API response. Finalization requires a successful receipt with the exact vault, job, settlement status and result digest. Pending transaction hashes are recorded before confirmation and checked before retrying. L2 inclusion is shown; Ethereum finality is a separate stage.

The token must be a standard ERC20 without transfer taxes or rebasing. Deposits reject an unexpected received amount. There is no administrator sweep of customer balances.

## Data and execution

D1 stores one private demo workspace per authenticated visitor. Atomic revision checks prevent concurrent updates from reserving the same balance twice. Interrupted demo reservations expire after 60 seconds and are recovered on the next access.

The browser advances the workflow while its tab is open. Closing it does not schedule background work. Demo documents can be deleted manually. Demo and live content older than seven days is cleared on the next authenticated access; no scheduled retention service exists. Expense metadata remains. The demo supports 100 task records and retains 150 recent events; the live workspace supports 50 task records.

See `docs/build-status.md` for the implementation review and remaining acceptance requirements.
