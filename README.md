# Porti — Your NEAR Companion

Porti turns everyday instructions into inspectable NEAR workflows: research a token, follow a wallet, prepare a payment to an @username, buy NEAR through a payment provider, stake, or route NEAR into a supported asset on another network. The movable anime companion uses NEAR AI Cloud; the user keeps wallet signing authority.

**Status: owner-private beta, v0.14.** Free device wallets need no provider account; the optional managed passkey service needs separate setup: [activation guide](docs/internal-wallet.md). A feature being implemented or configured is not evidence of a successful financial transaction. [Judge walkthrough](HACKATHON.md) · [Owner setup](docs/commerce-setup.md) · [Transaction behavior](docs/transactions.md) · [Submission checklist](docs/hackathon-submission.md).

## What you can try

| Area | Behavior and boundary |
| --- | --- |
| Ask Porti | NEAR AI Cloud tool chat; typed purchase requests open a payment-method card; workflow cards open Swap, Stake, Buy, Transfers or Markets. Pictures use a separate NEAR AI Cloud vision request. |
| Research | Token metadata, live provider charts, sampled top traders and partial risk evidence. Missing holders, liquidity locks, admin permissions or sellability checks remain unknown. No calibrated rug probability. |
| Markets | NEAR pool-volume rankings, reported positive 24h gainers, and curated Black Dragon / SHITZU coverage. One returned pool per token; not a complete market-cap ranking or memecoin census. |
| Wallets / payments | Free browser-local implicit wallets with encrypted backup/restore, optional setup-gated Seams passkey wallets, external wallet connections, NEP-413 wallet-control proofs, username-linked NEAR recipients and explicit wallet-approved transfers. Local wallet keys are generated on the user’s device and stored encrypted in that browser; the server and AI never receive them. |
| Swap | Native NEAR source; NEAR-mainnet output or supported Ethereum, Base, Arbitrum and BNB Chain output from the live 1Click catalog. Confirmed recipient, NEAR refund address, quote review and separate wallet approval. |
| Stake | Reviewed liquid staking into the fixed Meta Pool contract. Funded acceptance remains unverified; no built-in exit or native-validator delegation. |
| Buy NEAR | USD purchase card with card / Apple Pay selection. Signed MoonPay checkout requires merchant credentials, eligibility and trusted customer-IP configuration. No card details in Porti. |
| Social | Accepted-friend messages and private picture attachments; blocking revokes access. X profile linking uses read-only OAuth scopes and needs owner app credentials. |
| Porti Care | Evidence-backed support requests, two independent human approvals, verified recipients and reviewed NEAR/NEP-141 donations. [Setup and limits](docs/porti-care.md). |
| Appearance | Automatic local day/night theme with saved Light/Dark/Auto preference. |
| Alerts | Linked Telegram observations and authorized delivery. Background updater requires the existing owner-private hosting boundary. |
| Porti Apps | Five curated read-only adapters: Rhea pools, standard staking pools, Meta Pool, NEAR Social and AstroDAO. The separate transaction screens require user approval. |

## Run and verify

Use Node.js **22.22.2+**, the locked npm dependencies and the repository scripts:

```sh
npm ci
npm run check
npm test
npm run build
npm run dev
```

The application targets React/vinext on Cloudflare Workers with D1 (`DB`) and private R2 (`BUCKET`). Hosting supplies authenticated request identity. An ordinary Node server does not replace those services: see [deployment prerequisites](docs/setup.md) and [owner configuration](docs/commerce-setup.md). Unit tests run without live credentials. A hosted interactive demo requires the configured hosting environment and authorized sign-in.

## Evidence and limitations

104 automated tests currently cover research adapters, username proofs, owner isolation, quotas, exact transfer/staking evidence, chat membership, image permissions, OAuth state, signed checkout construction, and swap routing/approval constraints. Run them yourself; this is not an independent security audit.

The development environment returned HTTP 403 from the 1Click catalog and the holder indexer. Porti reports provider failures without fabricated balances, quotes or safety results. X/MoonPay credentials must be supplied by the owner. Funded swaps, purchases and stakes were not executed during development QA. See [production readiness](docs/production-readiness.md), [transaction limits](docs/transactions.md) and [operations](docs/operations.md).

## Configuration and architecture

Keep secrets in the host's runtime environment or the existing encrypted provider settings, never Git or ordinary chat. [Setup table](docs/commerce-setup.md) lists exact names and callback URLs. Do not rotate `PORTI_SETTINGS_KEY` without a recovery plan.

- `app/near-workspace.tsx`: grouped navigation and workflow composition.
- `app/porti-companion.tsx`, `lib/near-agent.ts`: chat, bounded tools and review cards.
- `lib/swaps.ts`, `lib/swap-chains.mjs`: catalog, quotes, single funding request and settlement lookup.
- `lib/near-services.ts`, `lib/staking.ts`: transfer/staking reviews and strict NEAR receipt evidence.
- `lib/funding.ts`, `lib/x-connect.ts`: signed provider checkout and owner-bound OAuth PKCE.
- `lib/media.ts`, `lib/friends.ts`: private image access and current friendship authorization.
- `lib/markets.ts`, `lib/token-chart.ts`, `lib/token-traders.ts`: labeled provider snapshots.
- `lib/telegram.ts`, `lib/workspace.ts`, `drizzle/`: observations, durable state, identity and quotas.

Porti uses NEAR-inspired mint, black and white with original anime artwork and Fredoka/Nunito typography. Font licenses are in `public/fonts`. Porti is independent; integrations do not imply official partnerships.
