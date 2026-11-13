# Porti — Your NEAR Companion

Research a token, inspect the evidence, and prepare a wallet-reviewed action without juggling tabs. Porti combines a NEAR AI Cloud companion with NEAR mainnet tools, NEAR Intents / 1Click swap preparation, Meta Pool staking and verified wallet identities. The model proposes; validated reviews describe the action; the user's wallet signs.

**Hackathon beta · v0.14 · verified 13 November 2026.** The public walkthrough needs no email, code or wallet. It uses clearly labelled fictional data. Live workspaces require NEAR-wallet sign-in and the relevant provider configuration. Several production integrations remain unconfigured; not every feature has end-to-end acceptance.

**[Open Porti](https://porti-near.hoymick240.workers.dev/)** · **[Screenshot demo and script](docs/demo/README.md)** · **[Judge walkthrough](HACKATHON.md)** · **[Verification and limits](docs/verification-2026-11-13.md)** · **[Submission checklist](docs/hackathon-submission.md)**

![Porti public walkthrough](docs/demo/01-overview.png)

## Try the public demo in two minutes

1. Open Porti and choose **Try demo**. Check the **Fictional walkthrough** banner.
2. On Overview, select the **MOCHI** sample report under **What you're looking into**. Inspect its chart, indicators and **Risk checks**. Unresolved checks remain explicit.
3. Close the investigation. Open the companion, then choose **Stake NEAR** in **Explore Porti**. The form stays inside chat. Preparation is disabled in walkthrough mode; no sample funds are submitted.
4. Minimize chat and open **Porti Apps** to inspect the five read-only adapter descriptions. Switch to Live and sign in to run authenticated tools.

The screenshots capture real public UI interactions with fixtures, not generated mockups or proof of financial settlement. [All five screenshots and timed script](docs/demo/README.md).

**[Download the 65-second captioned demo video](docs/demo/Porti-Demo.mp4)** (1080p MP4, silent).

## Features and actual scope

| Feature | Implemented behavior | Evidence / boundary |
| --- | --- | --- |
| Public access / identity | Public landing/demo; NEAR-wallet NEP-413 sign-in; account-bound sessions; verified main/agent roles | Session and restoration tests pass. Signature proves wallet control, not real-world identity. Legacy Cloudflare Access is optional. |
| Ask Porti | NEAR AI Cloud text/tool chat, stop/cancel, clear, 19 embedded workflows, follow-up transfer drafts, direct transfer/swap/staking review paths | Needs working user AI key and sign-in. Walkthrough pauses AI. Yes/no acts only on a current eligible review; wallet signature is still required. |
| Research / Rug Guard | Metadata, sampled holders, transfer-connected groups, account keys, WASM export screening and selected control getters | Partial evidence, not a contract audit or safety guarantee. Rate limits and unknowns stay visible. No honeypot/tax simulation or verified LP-lock coverage. |
| Markets / charts / tracking | Pool-based markets/gainers, charts/indicators, wallet tracking, watchlists and observations | Provider-dependent snapshots, not complete token coverage or predictive advice. Top Traders was removed. |
| Local agent wallets | Browser-generated implicit key pairs, encrypted local storage, backup/restore, password-gated private-key export | Synthetic-key tests pass. No mnemonic seed phrase is generated. Keys stay on-device; implicit addresses need activation funds to exist on chain. |
| Transfers / deposits | Native NEAR and NEP-141 reviews; exact amount/recipient; verified username lookup; main↔agent transfers; receipt reconciliation | Wallet approval required. Tests cover repeat guards, stale signers and matching final evidence. Unsupported OKX native-transfer path is blocked. No funded acceptance in this audit. |
| NEAR Intents swaps | Native NEAR source; supported same/cross-chain 1Click outputs; token/network search, stablecoin filter, destination/refund binding, expiry, registration and settlement checks | Ethereum, Base, Arbitrum and BNB Chain families depend on live catalog/routes. Destination is entered once; tokens determine network. No arbitrary source-chain execution, perps, lending or vaults. Live settled swap not established in this audit. |
| Meta Pool staking | Direct chat/form reviews to fixed contract; 1–100 NEAR; actual stNEAR mint evidence required for success | Tests pass; no funded stake in this audit. Unstaking/exits use Meta Pool separately and may involve fees/waiting. |
| Porti Apps | Rhea Pool Lens, NEAR Staking Lens, Meta Pool, NEAR Social, AstroDAO | Five curated read-only adapters, not unrestricted third-party code execution. |
| Social / profiles | Usernames, verified wallets, accepted-friend messages, private groups, membership/blocking checks | Authorization tests pass; real two-user acceptance not repeated. Picture sharing needs missing R2 binding. |
| Appearance | Light / Dark / local day-night Auto | Public UI rendered. Desktop captures do not establish full mobile-device acceptance. |

## Production setup gaps

Observed 13 November 2026; configuration may change after this checkpoint.

| Area | Current production limit |
| --- | --- |
| Pictures / vision / social attachments | D1 bound; private R2 `BUCKET` absent. Uploads return `MEDIA_NOT_READY`. |
| Buy NEAR | Required MoonPay merchant keys, live enablement and trusted-IP setting absent. A purchase card is not a completed purchase. |
| X linking | Required owner OAuth setup absent. No posting/DM permissions requested. |
| Optional Seams wallet | Provider runtime setup absent; free local wallet is separate. |
| Porti Care | Needs two independent reviewer identities and R2 evidence before real campaigns/donations. |
| Telegram | Maintenance endpoint returns `RUNNER_DISABLED`; unattended delivery not operational. Keep runner independently authorized. |
| Phone pocket | Default public simulator number unlinked. Send / last-three sends / freeze and SMS inbox incomplete. Contract tests are not live phone-service acceptance. |
| Financial acceptance | No fresh funded transfer, swap, stake, purchase or donation. Provider access, compatible wallet signing and final outcomes need separate acceptance. |

## Run and verify from a clean checkout

Use Node.js **22.22.2+** and locked dependencies. CI uses Node 22.

```sh
npm ci
npm run check
npm test
npm run lint
npm audit --audit-level=high
npm run build

# Build-only placeholder; NEVER deploy this database ID.
PORTI_D1_DATABASE_ID=11111111-1111-4111-8111-111111111111 npm run build:cloudflare

# Local D1 only; no remote database changes.
npm run db:local -- migrate
npm run dev
```

Open the URL printed by dev (portable default port 5173). The public walkthrough needs no paid AI key. Live chat needs a valid NEAR AI Cloud key in Connections; promotional credits depend on issuer eligibility and availability. Never paste keys into chat or Git.

Optional pocket-contract checks, using its pinned Rust toolchain:

```sh
cd contracts/pocket
cargo fmt --check
cargo clippy --all-targets --locked -- -D warnings
cargo test --locked
```

**Verified baseline:** [`80ca0eb`](https://github.com/hoymick/porti-near/tree/80ca0eb3edfb6f268d220151d0272dc3affa70b7). All **245 app tests across 41 files** passed, including a fresh Node 22.22.2 repeat; **25 pocket-contract tests** passed in GitHub CI. Typecheck, both builds, Rust formatting and clippy passed. Lint exited 0 with **0 errors / 582 warnings**. Dependency audit: **7 moderate / 0 high / 0 critical** advisories in the tooling chain. Tests include mocked RPCs, wallets and providers; they are not an independent audit or funded acceptance. [Dated evidence](docs/verification-2026-11-13.md).

## Architecture and deployment

- `app/near-workspace.tsx`, `app/porti-companion.tsx`: navigation, embedded workflows and chat approval UI.
- `lib/near-agent.ts`: bounded tools, typed requests and review creation.
- `lib/near-services.ts`, `lib/staking.ts`: transfers, staking and strict receipt evidence.
- `lib/swaps.ts`, `lib/swap-chains.mjs`: 1Click catalog, quotes, funding and settlement.
- `lib/media.ts`, `lib/friends.ts`, `lib/workspace.ts`, `drizzle/`: private access, identity, encrypted settings and durable state.
- `lib/funding.ts`, `lib/x-connect.ts`, `lib/telegram.ts`: separately configured integrations.
- `contracts/pocket/`: scoped pocket contract and unit tests.

React/vinext targets Cloudflare Workers with D1 `DB`; attachments require private R2 `BUCKET`. Production builds from `cloudflare-standalone`; keep `main` synchronized so default source is reviewable. See [Cloudflare hosting](docs/cloudflare-hosting.md), [sign-in](docs/sign-in.md), [configuration](docs/commerce-setup.md), [transaction limits](docs/transactions.md) and [operations](docs/operations.md). The placeholder ID above is never a production database.

Keep credentials in runtime secrets or encrypted provider settings. Do not rotate `PORTI_SETTINGS_KEY` without a recovery plan. The server and AI do not need a user's private key or recovery phrase.

## Provenance and licensing

The earliest recorded repository commit is **4 November 2026**; history includes imported/source checkpoints. There is no pre-19-October baseline tag here, so commit dates alone do not establish every imported line was newly written during the hackathon. Distinguish any earlier foundation in the final entry; do not infer provenance from import dates.

Porti is independent; integrations do not imply official partnerships. Fredoka/Nunito licenses remain in `public/fonts`. A project-wide source license has not yet been selected; these docs make no new licensing grant.
