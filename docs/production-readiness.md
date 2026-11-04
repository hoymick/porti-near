# Porti v0.9 — hardening and launch evidence

This release is a hardened private beta. It is not a certification that public deployment or funded use is safe. The Site remains owner-private. Real-account acceptance, an independent security review and a host-level recovery drill remain launch gates.

## Implemented and tested

| Area | Change | Verification |
| --- | --- | --- |
| API boundary | Same-origin JSON writes, streamed UTF-8 body limits and object validation | Malformed, cross-origin, oversized and streamed requests are rejected |
| Abuse and cost controls | Durable per-owner request quotas; chat capped at 6 turns/minute and 100/day; bounded context | Concurrent requests cannot exceed the database quota |
| Private chat | Membership and both active profiles are checked in the actual message SELECT/INSERT | Block during a read, username reuse, pending requests and foreign owners cannot expose messages |
| Profile ownership | Signature consumption and username write commit in one D1 batch | Replay and unlink-during-verification races are rejected |
| Wallet roles | Domain/account/owner/role-bound NEP-413 proofs; current full-access-key verification | Ownership and replay tests; real wallet acceptance still required |
| Transfer preparation | Request IDs deduplicate retained review retries; no automatic resubmission | Concurrent preparation returns one review; approval can only be requested once |
| Gas balance | Finalized network gas price, action-count estimate and a safety buffer | Native, FT and FT-plus-storage reserve calculations |
| Transfer confirmation | FINAL execution, exact transaction hash/actions, closed successful receipt graph, review-time check | Optimistic/missing/failed/old receipt evidence is rejected |
| FT confirmation | Matching NEP-141 transfer event from the exact token executor | Successful no-op calls and wrong recipients/amounts cannot produce a verified receipt |
| Receipt accounting | Durable unique owner/hash and owner/review constraints | Two concurrent hashes cannot finalize one review; history eviction cannot permit reuse |
| Credentials | Owner-bound AES-GCM, public-state allowlist and isolated provider configuration scopes | Wrong-owner decrypt fails; a broken AI credential does not disable unrelated RPC reads |
| Providers | Bounded responses, mainnet identity checks, quote cache/inflight deduplication, provider cooldown | Exact token side, forming/completed candles, concurrency and stale-cache tests |
| Telegram | Encrypted dedicated bots, private Start-code confirmation, fenced delivery and bounded retries | Unique bot, linked sender, acknowledged message IDs, stop, leases and cooldown tests |
| Operations | System status screen, live database/RPC probe, observed acceptance evidence, redacted error IDs | Authenticated health endpoint and structured error responses |
| CI | Immutable official GitHub Action pins; install, types, tests, dependency audit and production build | See the repository Actions results for hosted execution |

## Dependency audit

The full dependency graph was scanned with `npm audit`; the dated result and package-lock SHA-256 are recorded in [security-audit.json](security-audit.json). At that snapshot there are zero high or critical findings. Sixteen moderate findings remain in the ESLint/minimatch tooling chain. They are documented rather than suppressed or claimed fixed; they require review before accepting a broader threat model. The CI gate fails on high or critical advisories across the full graph, including development dependencies used to bundle the runtime.

The framework, React/RSC, Next.js, Cloudflare tooling and Zod were upgraded together. Scoped overrides patch Sharp, fflate and the legacy Drizzle esbuild loader. Do not run `npm audit fix --force`: the suggested downgrades/major changes can break this deployment. Re-run checks and the build after any lockfile update.

## Real-account acceptance still required

1. In Connections, save a NEAR AI Cloud key through the secure field. Complete a real chat with a successful allowlisted research tool. A configured key alone is not acceptance evidence.
2. Configure working NEAR mainnet RPC and NearBlocks access. Verify a known token's holder sample against the explorer. Missing candidates must remain missing, rather than being labeled the full top ten.
3. Connect an already active main account and a separate agent account. Sign ownership proofs. Newly created wallets must complete provider activation/funding before an onchain full-access-key check can succeed.
4. With the wallet owner present, prepare and approve a small native transfer, then an FT transfer from a standard event-emitting contract. Verify exact amount/receiver, wallet cancellation, redirect return, expiry, storage registration and receipt reconciliation. No funded transfer was executed by Codex.
5. Link a dedicated Telegram bot, confirm the displayed account and explicitly send a test. Exercise pause/resume/stop and verify an actual queued alert. The background task is hourly; manual checks are available. No real Telegram message was sent during automated development checks.
6. Grant a second tester Site access separately from GitHub access. Link both profiles; exercise friend acceptance, chat, block and username unlink on desktop and mobile.

System status displays observed inference, proof and delivery evidence. It does not fabricate success when provider setup is absent. It also cannot establish an independent security audit or a host backup restore.

## Data, privacy and operational limits

Friend messages are plain text on the server, without end-to-end encryption. The message endpoint only serves the latest 90 days; expired records are deleted by bounded background cleanup. Telegram queue records expire after seven days. Cleanup runs on the existing maintenance task, so physical deletion can lag if maintenance stops or a backlog exceeds one batch. Operational credentials remain encrypted; no wallet recovery phrase or signing key is stored by Porti.

The outbox deduplicates events and records Telegram message IDs, but a lost acknowledgement can cause duplicate external delivery. The runner handles up to three bot workspaces and one due watch per workspace per invocation. This is a bounded pilot capacity, not a high-scale notification SLA.

The current unattended REST writer relies on the owner-private Sites dispatcher. Do not widen the Site audience before adding and testing independent runner authorization or moving maintenance to a separately protected service. Public launch is explicitly blocked by that requirement. No audience change was made in this release.

Transfer preparation idempotency covers retained reviews; it is not a permanent payment-intent API. Ledger uniqueness provides durable reconciliation accounting. Event verification assumes the configured mainnet RPC and token contract truthfully implement NEAR/NEP-141 semantics. It cannot prove an arbitrary token's economic value or safety. Unsupported historical FT contracts without standard events may execute successfully while Porti refuses to mark delivery verified; keep the hash and inspect the explorer.

## References

- [NEAR transaction finality and receipt semantics](https://docs.near.org/api/rpc/transactions)
- [NEP-413 ownership message standard](https://github.com/near/NEPs/blob/master/neps/nep-0413.md)
- [Operational runbook](operations.md)
