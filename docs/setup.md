# Porti setup

Current source guide, reviewed 13 November 2026. Start with [README](../README.md); older release documents describe earlier deployments.

## Local development

Use Node **22.22.2+** and `npm ci`. Run `npm run db:local -- migrate`, then `npm run dev` and open the printed localhost URL (portable default 5173). Migrations are local only in that command. The fixture walkthrough needs no AI key or funds. Live sign-in uses a NEAR mainnet wallet and a one-time NEP-413 message; see [sign-in](sign-in.md).

For encrypted local settings, privately configure a random high-entropy `PORTI_SETTINGS_KEY` of at least 32 bytes in gitignored `.dev.vars`. Keep it stable. Add provider keys through secure Connections fields or runtime secrets. Never commit local vaults, `.dev.vars`, `.wrangler` state or keys. Do not export production secrets into a local checkout for convenience.

## Configuration inventory

| Name / binding | Purpose |
| --- | --- |
| `DB` | D1 binding. Apply the ordered migrations in `drizzle/`; preserve names/history. |
| `PORTI_SETTINGS_KEY` | Stable credential-encryption root. Rotation requires credential recovery/migration. It is not a wallet key. |
| `PORTI_APP_URL` | Actual HTTPS app origin, without trailing slash. |
| `PORTI_AUTH_MODE` | `near` by default on standalone/local; optional `access`; hosted Sites uses its own `sites` identity path. |
| `NEAR_AI_API_KEY` | Optional shared NEAR AI Cloud key; encrypted per-user Connections keys are supported instead. |
| `NEARBLOCKS_API_KEY`, `NEAR_RPC_URL` | Optional indexer key/mainnet RPC override; users can configure supported reads through Connections. |
| `NEAR_INTENTS_API_KEY` | Optional server key for 1Click. Catalog/route access still needs acceptance. |
| `BUCKET` | Optional **private** R2 binding for AI images, social pictures and Care evidence. Without it those uploads fail closed. |
| `X_CLIENT_ID`, `X_CLIENT_SECRET` | X OAuth confidential-client setup. Register `<app-origin>/api/porti/x/callback`. |
| `MOONPAY_PUBLIC_KEY`, `MOONPAY_SECRET_KEY` | Approved live merchant keys for signed checkout. |
| `PORTI_MOONPAY_IP_HEADER`, `PORTI_MOONPAY_LIVE_ENABLED` | Trusted host-controlled end-user IP header; enable live only after provider approval and forwarding checks. |
| `PORTI_CHARITY_REVIEWER_IDS` | At least two independent authenticated reviewer IDs, not display names or guessed wallet addresses. |
| `PORTI_SEAMS_*` | Optional managed wallet configuration; [exact six fields](internal-wallet.md#exact-runtime-settings). Free device wallets need none. |
| `PORTI_ACCESS_TEAM_DOMAIN`, `PORTI_ACCESS_AUD` | Only for explicitly selected Cloudflare Access mode. Never fabricate verified identity headers. |
| `PORTI_USSD_TOKEN`, `PORTI_POCKET_KEY`, `PORTI_USSD_RPC` | Real-phone callback token, scoped mainnet pocket signing key, optional mainnet RPC. |
| `PORTI_SIM_POCKET`, `PORTI_SIM_RECIPIENTS`, `PORTI_SIM_PIN` | Public testnet simulator pocket/directory/demo PIN; default PIN is intentionally public, `1234`. |
| `PORTI_SIM_POCKET_KEY`, `PORTI_SIM_OWNER_KEY`, `PORTI_SIM_RPC` | Separate testnet-only keys/RPC. Owner key enables demo-only unfreeze; never use a real mainnet owner key here. |

This table names settings only. Presence is not proof that a provider works. Most read-only app adapters need no extra vendor API key, but still depend on RPC access. Telegram bots are configured separately in the Telegram password form, not general chat.

## Hosting targets

The live URL is the Cloudflare Worker. Follow [Cloudflare hosting](cloudflare-hosting.md) for build variables, binding generation and deliberate deployment. `main` contains latest source; `cloudflare-standalone` is the configured production branch. Check which commit is actually deployed.

The original owner-private Sites deployment is separate. Preserve its audience, project identity and service-token boundary. Its Telegram updater does not refresh an unrelated Worker database. Do not copy host identity headers, service tokens, user data or browser vaults between hosts.

## Validation

Run `npm run check`, `npm test`, `npm run lint`, `npm audit --audit-level=high`, `npm run build`, and the build-only Cloudflare command in README. Use the dummy D1 ID only for build validation, never deployment. Tests do not exercise funded mainnet actions. Review [verification](verification-2026-11-13.md) and [operations](operations.md) before broader use.
