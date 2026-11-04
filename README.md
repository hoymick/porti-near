# Porti - Your NEAR Companion

Porti is an anime-inspired AI companion for NEAR mainnet. Investigate tokens, explore holder concentration, follow accounts, link a wallet to a platform @username, and prepare transfers for explicit wallet approval.

## Product status

- **Implemented:** movable companion, NEAR AI Cloud tool adapter, finalized account/token reads, partial holder screening, watchlists, verified username-to-wallet mappings, reviewed native/NEP-141 transfers and receipt verification.
- **In progress:** Telegram account linking, preferences, outbox and polling runner. The Telegram feature is not deployed or acceptance-tested; no background schedule or bot token has been configured.
- **Activation required:** a working mainnet RPC and a NEAR AI Cloud API key. Live inference and funded wallet acceptance remain unverified.

Porti does not autonomously trade or sign transactions. Holder concentration is an observation, not a calibrated rug probability. Walkthrough data is explicitly fictional. Username verification proves wallet control, not a person's identity.

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
| `PORTI_APP_URL` | HTTPS deployment origin used for Telegram's Open in Porti button. |
| `NEAR_AI_API_KEY` | Optional shared inference credential; users may configure their own encrypted key through Connections. |
| `NEARBLOCKS_API_KEY` | Optional shared indexer credential. |
| `NEAR_RPC_URL` | Optional mainnet RPC override. |
| `DB` | Cloudflare D1 binding; configured by the hosting integration. |

This cleaned repository uses Porti-specific encryption configuration. Before deploying over an installation using another encryption scheme, plan migration or re-entry of saved credentials. Never rotate the settings key without a recovery plan.

## Code map

- `app/near-workspace.tsx`: Porti navigation and NEAR workflows.
- `app/porti-companion.tsx`: movable anime launcher and chat.
- `app/telegram-settings.tsx`: Telegram configuration interface (in progress).
- `app/api/porti/route.ts`: authenticated application actions.
- `lib/near-agent.ts`: bounded NEAR AI Cloud tool loop.
- `lib/near-services.ts`: data adapters, transfer reviews and reconciliation.
- `lib/near-profile.ts`, `lib/near-identity.mjs`: username directory and NEP-413 proofs.
- `lib/token-risk.mjs`: NEAR holder graphs and partial concentration screening.
- `lib/telegram.ts`: Telegram linking, queue and runner (in progress).
- `lib/store.mjs`: Porti-only workspace persistence with optimistic revision checks.
- `db/`, `drizzle/`: database schema and ordered migrations.
- `tests/`: NEAR, holder-risk, notification-policy and storage checks.

Read [the implementation specification](docs/near-porti-v06.md) and [the paused-work checkpoint](CHECKPOINT.md) before extending or deploying the app.

## Design

Porti uses NEAR-inspired mint, black and white, Fredoka/Nunito typography, and original anime artwork. Font license notices are included in `public/fonts`. Porti is an independent project.
