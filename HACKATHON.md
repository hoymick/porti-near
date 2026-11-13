# Porti — judge walkthrough

Project-specific guide, updated 13 November 2026. Official rules: <https://nearhackathon.com/HACKATHON.md>. Deadline: **14 November 2026, 23:59 UTC** (15 November, 00:59 WAT). Recheck before submitting.

## Problem and approach

Users should not need separate tabs to investigate a token and prepare a reviewed action. Porti brings research, identity and transaction preparation into a NEAR AI Cloud companion. The boundary separates model suggestions, validated reviews, user wallet signatures and observed execution evidence.

The code integrates NEAR Intents / 1Click for supported native-NEAR-source swaps and Meta Pool for liquid staking. It does not implement perps, lending or vaults, or claim a freshly demonstrated cross-chain settlement. Choose tracks from actual evidence, not the event's entire example feature list.

## Hosted demo — no funds or sign-in

Open <https://porti-near.hoymick240.workers.dev/> and choose **Try demo**. Follow [the screenshot sequence](docs/demo/README.md): Overview → MOCHI sample chart → risk checks → embedded Stake NEAR workflow → Porti Apps. Fixtures are labelled; AI and money movement are paused.

This is an interface walkthrough, not a live trade recording. Unknown LP locks, sellability and ownership semantics remain unresolved; the sample report establishes no real token's safety.

## Reproduce the implementation

Use [README commands](README.md#run-and-verify-from-a-clean-checkout). Audited baseline: `80ca0eb3edfb6f268d220151d0272dc3affa70b7`. 245 app tests across 41 files plus 25 contract tests passed; typecheck and both builds passed. Lint: 582 warnings / 0 errors. Tests include mocks; no funded acceptance was performed.

| Inspect | Expected boundary |
| --- | --- |
| Public landing / Try demo | No email/OTP/wallet needed to visit; fixtures labelled. |
| NEAR-wallet sign-in | Account/domain/nonce-bound NEP-413 proof; private workspace session. |
| Live chat with configured AI key | Bounded tools and honest provider errors; no sample/live data mixing. |
| Direct transfer / swap / staking | Current exact review before approval; yes/no applies only to eligible pending review. Wallet signature remains separate. |
| Recipient / token search | One destination entry; token determines network. Quotes, refunds, expiry and signer checked. |
| Transaction outcome | Popup/hash alone is not success; matching final receipts or settlement evidence required. |
| Risk report | Partial samples/provider failures visible; no complete audit or rug probability. |
| Local device wallet | Synthetic tests cover encryption, restore/export. No seed phrase; never send keys through AI. |
| Social / Care / pictures | Membership tested; production R2/reviewer gaps limit real use. |

## Outstanding acceptance

See [production gaps](docs/verification-2026-11-13.md): R2, MoonPay, X, optional Seams and Care reviewer setup missing; Telegram runner disabled; default phone sample unlinked with incomplete actions. Real provider access, user signing and funded final outcomes were not established.

The repository and hosted demo are public. A human still needs to publish the demo on X with **@NEARProtocol #NEARHackathon**, supply its actual public URL and complete the form. [Prepared checklist and draft](docs/hackathon-submission.md).
