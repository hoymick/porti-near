# Porti source checkpoint - 4 November 2026

Work paused at the owner's request to share the current code.

## Stable baseline
NEAR companion, NEAR AI Cloud adapter, holder research, partial Rug Guard, wallet-approved transfer reviews, verified @username wallet profiles, and NEAR mint theme. Last deployed source: afb54a376f1d5e52022f52b4da213d8f01031aa2.

## Work in progress: Telegram
Includes bot configuration, one-use linking, app confirmation, preferences, outbox, polling runner, and a generated migration. These changes have NOT been deployed, acceptance-tested, or scheduled. No Telegram bot token has been configured.

Known verification issue at pause: TypeScript reports response JSON typed as unknown in app/telegram-settings.tsx. Resolve that and review delivery, retry, concurrency and digest logic before treating this as ready. No code was changed after the pause request except this handoff note.

NEAR AI still needs a configured key; the last public RPC test failed. No funded wallet acceptance test has been run.

## Development
Node >=22.13.0. Install with npm ci; type-check with npx tsc --noEmit; tests via npm test; build via npm run build. The original hosting depends on Cloudflare Workers/D1 and Sites authentication. A standalone host requires equivalent identity/storage configuration. Do not deploy as a public app without reviewing authorization, particularly the shared Telegram runner route.

No runtime secrets, user databases, dependency directories or generated build output are included. Existing legacy WIF modules are retained as source history alongside the active NEAR product.
