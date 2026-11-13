# Independent Cloudflare hosting (private pilot)

This optional target leaves the existing Sites build and project identity unchanged. Use the `cloudflare-standalone` branch. It is not a completed migration of hosted data or credentials.

## Account setup

1. Stay on Workers Free. Create a D1 database named `porti-near`. Copy its database UUID (not a credential).
2. Under the Worker's build variables set `PORTI_D1_DATABASE_ID` to that UUID and `NODE_VERSION` to `22.22.2` or later.
3. Select production branch `cloudflare-standalone`, build command `npm run build:cloudflare`, deploy command `npm run deploy:cloudflare`, root `/`.
4. Enable Cloudflare Access for the Worker's production hostname. Allow only the owner's exact email for this private pilot. Protect preview/version URLs too, or keep them disabled. Do not create an Everyone, Bypass or public policy. Access enrollment may require account-level setup; do not approve a paid plan to proceed.
5. Add these **runtime secrets** through the Cloudflare dashboard so deployment does not overwrite them as ordinary vars:
   - `PORTI_ACCESS_TEAM_DOMAIN`: exact HTTPS team origin, e.g. `https://your-team.cloudflareaccess.com`, without a trailing slash.
   - `PORTI_ACCESS_AUD`: the 64-character Application Audience tag from the Access application.
   - `PORTI_SETTINGS_KEY`: a new cryptographically random value of at least 32 bytes, generated privately. Never paste it into GitHub, logs, screenshots or chat. Do not reuse an unknown key from the old deployment.
6. Deploy. The script applies the existing D1 schema migrations before uploading the generated Worker. Confirm the build token permits D1 migrations; add only the D1 permission needed if the deploy log reports authorization failure.
7. Sign in through Cloudflare Access. Verify owner isolation, database writes, session expiry, profile proof and denied access from another browser before entering provider credentials or using funds.

Missing Access configuration returns HTTP 503. Missing or invalid signed login returns HTTP 401. Browser-supplied hosting identity headers are discarded and rebuilt only after RS256 issuer/audience/expiry verification. This is not a public multi-user launch.

## Storage and credentials

D1 is independent and starts empty. Existing hosted profiles, history and uploaded pictures are not copied. The `DB` binding is generated from the real build variable; an unset ID fails the build.

R2 is optional and **not enabled by default**. Image uploads and private picture reads remain unavailable without `BUCKET`. To preserve those features later, explicitly enable R2 and set build variable `PORTI_R2_BUCKET` to the bucket name. R2 has usage-based billing beyond its allowance; no subscription is enabled by this code. Do not silently enable it for a zero-budget account.

Add NEAR AI credentials using the deployed app's secure Connections form. Provider charges/credits are separate from hosting. Do not put API secrets in build variables or source. Configure other providers only when needed.

Wallet vaults stay in the original browser origin. Restore the existing encrypted backup locally on the new origin with its original password. Never create a replacement wallet to recover an existing one. The backup does not include the pending transaction journal; reconcile existing hashes before any new signatures.

## Telegram boundary

The cross-workspace `/api/porti/telegram/run` endpoint is disabled at both the Worker gateway and route in standalone mode. No background schedule is created. Existing per-user Telegram setup code remains, but unattended refresh/delivery requires a separately authenticated scheduler and live acceptance before it can be claimed operational.

## Validation and limits

Local checks: 112 tests pass, including forged identity rejection, wrong signature/issuer/audience/expiry, safe same-origin login/logout redirects, original-host compatibility and runner denial. Type checking and the independent production build must pass before publishing. The build verification uses a test UUID only; it does not create or connect a real database.

Free-plan CPU, request and database limits still apply. Funded transfers, swaps, staking, live AI inference and Telegram delivery have not been verified on this target. Existing wallet approval and receipt verification remain mandatory.

References:
- https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/authorization-cookie/validating-json/
- https://developers.cloudflare.com/workers/configuration/cloudflare-access/
- https://developers.cloudflare.com/workers/vite-plugin/reference/api/
