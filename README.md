# Porti - Your NEAR Companion

Porti is an anime-inspired AI companion for NEAR mainnet. Investigate tokens, explore holder concentration, follow accounts, link a wallet to a platform @username, and prepare transfers for explicit wallet approval.

## Product status

This is a hardened private beta. See [production readiness](docs/production-readiness.md), [operations](docs/operations.md) and the System status screen for completed safeguards and remaining launch gates. Do not widen the current owner-private audience until runner authorization and recovery controls are independently verified.

Porti v0.9 retains a main/agent wallet hub, provider-assisted wallet creation, reviewed funding, token candlesticks and technical readings, accepted-friend chat, Telegram linking and queued observations, and a mint anime companion. Existing finalized research, username proofs and reviewed transfers remain in place.

See [release behavior and limits](docs/release-v08.md). Provider setup is required for actual AI inference and Telegram delivery. Wallet creation and all transfer signatures stay with the user. Missing market or RPC data remains missing; walkthrough values are fictional. Concentration is not a calibrated rug probability.

## Development

Use Node.js 22.13 or newer.

```sh
npm ci
npm run dev
```

This repository uses React, vinext/Vite and Cloudflare Workers with D1. The hosting integration supplies request identity and database bindings. A standalone deployment must provide equivalent authentication, private access controls and storage. See [setup](docs/setup.md).

```sh
npx tsc --noEmit
npm test
npm run build
```

## Configuration

Set secrets in the host's runtime configuration, never in source control.

| Name | Purpose |
| --- | --- |
| `PORTI_SETTINGS_KEY` | High-entropy server secret used to derive the authenticated settings-encryption key. |
| `PORTI_APP_URL` | HTTPS deployment origin for operational configuration. |
| `NEAR_AI_API_KEY` | Optional shared inference credential; users may configure their own encrypted key through Connections. |
| `NEARBLOCKS_API_KEY` | Optional shared indexer credential. |
| `NEAR_RPC_URL` | Optional mainnet RPC override. |
| `DB` | Cloudflare D1 binding; configured by the hosting integration. |

This cleaned repository uses Porti-specific encryption configuration. Before deploying over an installation using another encryption scheme, plan migration or re-entry of saved credentials. Never rotate the settings key without a recovery plan.

## Code map

- `app/near-workspace.tsx`: Porti navigation and NEAR workflows.
- `app/porti-companion.tsx`: movable anime launcher and chat.
- `app/telegram-settings.tsx`: Telegram configuration interface.
- `app/api/porti/route.ts`: authenticated application actions.
- `lib/near-agent.ts`: bounded NEAR AI Cloud tool loop.
- `lib/near-services.ts`: data adapters, transfer reviews and reconciliation.
- `lib/near-profile.ts`, `lib/near-identity.mjs`: username directory and NEP-413 proofs.
- `lib/token-risk.mjs`: NEAR holder graphs and partial concentration screening.
- `lib/telegram.ts`: Telegram linking, queue and runner.
- `lib/store.mjs`: Porti-only workspace persistence with optimistic revision checks.
- `db/`, `drizzle/`: database schema and ordered migrations.
- `tests/`: NEAR, holder-risk, notification-policy and storage checks.

Read [the implementation specification](docs/near-porti-v06.md) and [the current checkpoint](CHECKPOINT.md) before extending or deploying the app.

## Design

Porti uses NEAR-inspired mint, black and white, Fredoka/Nunito typography, and original anime artwork. Font license notices are included in `public/fonts`. Porti is an independent project.
