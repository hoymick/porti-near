# Porti setup and deployment

## Prerequisites

Use Node.js >=22.13.0. Install locked dependencies with `npm ci`. The application targets Cloudflare Workers and D1 through the repository's existing hosting integration. Browser identity is supplied by that host, not by a standalone password login.

## Runtime settings

Configure `PORTI_SETTINGS_KEY` as a cryptographically random, high-entropy secret in the deployment platform. It derives the AES-GCM settings key using the `porti-settings-v1` domain. Per-owner authenticated data and random IVs bind encrypted credentials to their owner. Keep this key stable or plan a credential migration before rotation.

Set `PORTI_APP_URL` to the real HTTPS origin of the deployed Porti app. It identifies the deployed application for operational configuration. No deployment URL is hardcoded into notification delivery.

Optional server-level provider settings are `NEAR_AI_API_KEY`, `NEARBLOCKS_API_KEY` and `NEAR_RPC_URL`. Users can instead verify and save encrypted credentials through Connections. Never include secret values in Git, environment examples, screenshots or chat.

## Database

Bind D1 as `DB`. Apply the files in `drizzle/` in journal order; preserve migration filenames and snapshots. The schema contains workspaces, verified username profiles and Telegram tables. Workspace mutations use optimistic revision checks; the active state contains only the `porti` namespace.

For an existing installation, back up the database and test compatibility first. This source uses Porti-specific settings encryption. Previously encrypted provider settings from another derivation must be migrated or re-entered; merely changing an environment-variable name does not migrate ciphertext.

## Validation

Run `npx tsc --noEmit`, `npm test` and `npm run build`. Verify sign-in, account isolation, research failures, username proof checks, transfer expiry and exact receipt matching. Financial acceptance requires the wallet owner's explicit actions.

## Telegram activation

Open Telegram in Porti, create a dedicated bot through @BotFather, and enter its token in the password field. Active webhooks are refused. Generate a secure link, press Start in the bot's private chat, check Telegram from Porti and confirm the displayed account. Choose categories, resume delivery and use Send test alert when ready. Never paste bot tokens in ordinary chat.

Per-check category delivery is supported. The runner refreshes one due watch per workspace and sends up to three queued alerts. The UI shows registered scheduling and actual run timestamps separately. Consult docs/release-v08.md for retention, retry and concurrency limits. The private maintenance endpoint uses host service access; no visitor ID is fabricated. Preserve owner-private access or add independent authorization before changing the audience.

## Branding and hosting

The product name is Porti, package name is `porti`, report downloads use `Porti_Rug_Guard.html`, and the favicon uses the mint Porti star. Existing hosting project identity is preserved for compatibility. The original hosting identity remains unchanged; this release updates the Porti application in place.
