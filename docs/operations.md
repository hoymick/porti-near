# Porti operations

## Before deployment

Use Node 22.16 or later, `npm ci`, `npm run check`, `npm test`, `npm audit --audit-level=high` and `npm run build`. Preserve `.openai/hosting.json` identity and all applied migration names/snapshots. Migrations 0004 add quotas and durable receipt accounting; they are additive. A failed deployment may already have applied migrations: inspect before retrying, never rewrite migration history.

Preserve `PORTI_SETTINGS_KEY`. It is an encryption root, not a wallet key. Rotating it without migration makes saved provider credentials unreadable. Keep an independently secured recovery copy through the hosting platform's secret-management process. Never store the plaintext root in Git, a database export, a schedule prompt or ordinary chat. Runtime values are configured through the host, rather than checked-in environment files.

## Monitoring

Open System status and run the database/mainnet check. A provider being configured is separate from observed successful inference, wallet ownership or Telegram delivery. Read the last actual Telegram check and acknowledgement; an enabled schedule alone does not prove either occurred.

API failures return `error.requestId` and `X-Request-Id`. Server errors log only component, ID, code and status. Search host Worker logs by that ID. Do not add raw exception messages, request bodies, proofs, cookies, provider URLs or API keys to logs. HTTP 429 includes Retry-After; do not bypass quotas by retrying immediately.

The maintenance task must run with supported private Site service access. It never impersonates a visitor or receives signing authority. Its endpoint is `/api/porti/telegram/run`; POST `{"action":"run"}` as JSON, then GET the same route to read the persisted aggregate result. A short maintenance cooldown can return `throttled` without a new run. Keep the Site owner-private. The registered hourly schedule and its original timezone must be preserved.

## Provider incidents

- RPC outage/wrong network: transfers fail closed. Preserve pending review IDs and hashes. Restore a trusted mainnet endpoint in Connections, then verify outcomes. Do not issue replacement payments merely because a request timed out.
- Market outage/rate limit: the browser may use the same public feed directly. A bounded last-good snapshot is visibly marked stale. It is not an executable quote or trading recommendation.
- AI outage: research forms and wallet-controlled transfers remain independent. Reconnect only the affected key; do not rotate the global encryption root to fix one credential.
- Telegram rejection: read the saved error. 429 observes a provider cooldown; terminal errors pause delivery. Recheck BotFather token/chat access and resume deliberately. Do not create another polling consumer for the same bot.

## Rollback

Use the host's saved version/deployment controls to redeploy the previous known-good application version, preserving owner-private access. Do not roll back additive schema changes by dropping tables. This release retains legacy Telegram tables for compatibility. Verify sign-in, state isolation, pending hash recovery and the private updater after rollback. Source provenance and deployment IDs are available from the host's saved versions.

## Backup and recovery gate

A Git repository backs up source, not D1 user data or runtime secrets. No host-level production database export or restore was performed in this session. Do not mark disaster recovery complete based on SQLite unit tests.

Before public launch, obtain a consistent host-supported D1 export and a platform-supported recovery procedure. Restore it into an isolated private environment with its own Site identity and bindings. Restore the corresponding encryption root through secure runtime configuration, disable notification scheduling in the isolated environment, and verify profile links, workspace ownership, unique receipt records and pending transfer hashes. Never replay transfers or Telegram deliveries during a restore drill. Record the recovery point, elapsed recovery time, row counts/invariants and the person who verified the result. Keep exports encrypted and access restricted.

If the current host cannot expose supported export/restore controls, resolve that with the hosting provider or migrate data to a deployment with tested backup controls before broad launch. Do not invent Cloudflare account IDs, database IDs, backup claims or recovery capabilities.

## Manual acceptance

The wallet owner performs all signatures and funded actions. Keys belong in Connections/Telegram password fields; recovery phrases stay with the wallet provider. Complete the concrete scenarios in production-readiness.md. Public sharing and broad customer onboarding wait for these results, the recovery drill, remaining dependency review and independent application security review.
