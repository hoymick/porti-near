# Porti setup and deployment

## Prerequisites

Use Node.js >=22.13.0. Install locked dependencies with `npm ci`. The application targets Cloudflare Workers and D1 through the repository's existing hosting integration. Browser identity is supplied by that host, not by a standalone password login.

## Runtime settings

Configure `PORTI_SETTINGS_KEY` as a cryptographically random, high-entropy secret in the deployment platform. It derives the AES-GCM settings key using the `porti-settings-v1` domain. Per-owner authenticated data and random IVs bind encrypted credentials to their owner. Keep this key stable or plan a credential migration before rotation.

Set `PORTI_APP_URL` to the real HTTPS origin of the deployed Porti app. It is used in Telegram notification buttons. No deployment URL is hardcoded into notification delivery.

Optional server-level provider settings are `NEAR_AI_API_KEY`, `NEARBLOCKS_API_KEY` and `NEAR_RPC_URL`. Users can instead verify and save encrypted credentials through Connections. Never include secret values in Git, environment examples, screenshots or chat.

## Database

Bind D1 as `DB`. Apply the files in `drizzle/` in journal order; preserve migration filenames and snapshots. The schema contains workspaces, verified username profiles and Telegram tables. Workspace mutations use optimistic revision checks; the active state contains only the `porti` namespace.

For an existing installation, back up the database and test compatibility first. This source uses Porti-specific settings encryption. Previously encrypted provider settings from another derivation must be migrated or re-entered; merely changing an environment-variable name does not migrate ciphertext.

## Validation

Run `npx tsc --noEmit`, `npm test` and `npm run build`. Verify sign-in, account isolation, research failures, username proof checks, transfer expiry and exact receipt matching. Financial acceptance requires the wallet owner's explicit actions.

## Telegram work in progress

The current design uses Telegram polling rather than a public webhook, preserving the private application boundary. A dedicated bot is configured through the password field in Porti. Private-chat linking requires a one-use ten-minute code, a Telegram Start action and confirmation in Porti.

Delivery rules include selected categories, local timezone, quiet hours, minimum native balance changes and daily or per-check delivery. The queue retains delivery attempts and bounded retries. These paths still require integration/security review and live bot acceptance before launch.

The unattended POST updater is `/api/porti/telegram/run`. It relies on the hosting platform's owner-private service access. It is not an unauthenticated public cron endpoint. Do not change the audience without adding independent runner authorization. A proposed 15-minute schedule has not been created. The UI's target cadence is not proof that a schedule exists.

## Branding and hosting

The product name is Porti, package name is `porti`, report downloads use `Porti_Rug_Guard.html`, and the favicon uses the mint Porti star. Existing hosting project identity is preserved for compatibility. This repository cleanup does not rename or redeploy the live hosting resource.
