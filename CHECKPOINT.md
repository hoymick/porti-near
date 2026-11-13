# Porti v0.14 — source and documentation checkpoint, 13 November 2026

Latest reviewed application baseline: `b2975045dc97e7877fda5e38abcaafbb84b9aa7e` on `main`. This adds a separate public testnet Phone Pocket simulator to the earlier PIN-confirmed Send, Last 3 sends and Freeze work. Ordinary wallet actions and real-phone USSD remain mainnet. The simulator needs its own testnet pocket, keys and recipient directory; source availability is not deployment proof.

Fresh checks: **264 app tests passed**, 0 failures/skips; typecheck, regular build and standalone build passed. Lint: **0 errors / 596 warnings**. Dependency audit: **7 moderate / 0 high / 0 critical**. Prior contract CI: 25 tests. [Evidence and limits](docs/verification-2026-11-13.md).

README, setup, hosting, provider, identity, social, Care, Pocket and operations documentation are reconciled to current source. Historical evidence is retained with dates. Shared wallet restoration and user-approved transfer/swap/stake reviews remain intact. No runtime code, credentials, resource bindings, privacy, financial transactions or public posts were changed by this documentation review.

`main` and configured production branch `cloudflare-standalone` can differ. Verify the production build SHA. The earlier hosted inspection found missing R2/MoonPay/X/Seams/reviewer configuration and disabled Worker Telegram maintenance; no fresh signed-in provider inventory was obtained. An HTTP 403 from this executor is not proof of an end-user outage.

See [README](README.md), [judge guide](HACKATHON.md), [demo](docs/demo/README.md) and [submission checklist](docs/hackathon-submission.md). Owner still confirms provenance, licensing, actual X post/form and live acceptance.
