# Porti v0.14 — submission checkpoint, 13 November 2026

Audited application baseline: `80ca0eb3edfb6f268d220151d0272dc3affa70b7`. Public landing and Try demo work; live identity uses NEAR-wallet sessions. This documentation update adds genuine public screenshots and a timed demonstration guide; it does not change financial execution.

245 app tests across 41 files passed, repeated on Node 22.22.2; 25 pocket-contract tests passed in CI. Typecheck, regular/standalone builds, Rust formatting and clippy passed. Lint: 0 errors / 582 warnings. Dependency audit: 7 moderate / 0 high / 0 critical. [Evidence](docs/verification-2026-11-13.md).

Direct chat transfer/swap/staking paths retain user signatures, valid-review checks and final evidence requirements. No fresh funded transfer, swap, stake, donation or purchase was executed.

Deployment gaps: R2 absent; MoonPay, X, optional Seams and charity reviewers unconfigured; Telegram runner disabled; default phone example unlinked with incomplete actions. Do not call these fully operational.

See [README](README.md), [demo](docs/demo/README.md) and [submission checklist](docs/hackathon-submission.md). No X post or form was published. Owner still selects any project-wide license and substantiates eligible work/provenance.
