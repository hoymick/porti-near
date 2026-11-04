# Porti — judge walkthrough

This is Porti's project-specific walkthrough, not a copy of the event's official HACKATHON.md. Event reference: https://nearhackathon.com/ . Submission deadline: 14 November 2026, 23:59 UTC. Recheck the current official rules before submission.

## Problem and approach

A user should not need separate tabs to understand a token, resolve a payment recipient, review a transaction and monitor its outcome. Porti puts those steps in one NEAR AI Cloud companion with human-controlled wallet approval. The key distinction is an explicit boundary between model suggestions, server-validated reviews, wallet signatures and observed evidence.

Recommended primary track: AI Security & Defense. Candidate secondary track: Unstoppable DeFi, after a successful cross-chain demonstration. There is one submission per project; select only tracks supported by the finished evidence.

## Reproduce without funding

Start with Node 22.16+, `npm ci`, `npm run check`, `npm test`, `npm run build`. Expected: type checking, deterministic tests and the Worker/client build pass. Tests use local fixtures and mocks; they are not proof of live external service success.

Interactive testing requires the configured host's authenticated identity, D1 and private R2. See docs/commerce-setup.md. The current deployment is owner-private; a private URL is not a publicly accessible judge demo. Do not disable identity or the Telegram runner's private boundary for convenience.

| Do this | Expected result |
| --- | --- |
| Open navigation | Three primary destinations and expandable Research, Wallet, Social & Alerts, Settings groups retain all screens. |
| Open System status | Setup flags and observed evidence are distinct; no credentials appear. |
| Open Research → Markets, refresh, switch tables | Returned NEAR provider rows have price, reported change, pool volume/liquidity, timestamp and source. Missing data or provider errors are explicit. |
| Investigate `wrap.near`, open Top traders and Risk checks | Actual sampled swap rankings and available risk evidence, with limited-coverage labels. Holder/provider failure does not produce invented holders or a safety verdict. |
| Ask “Show NEAR top gainers” with a working AI key | A bounded market tool result, or an honest provider failure. |
| Ask “Open swaps” | Workflow review card opens Swap. No funds move. |
| Ask “hi porti buy me $50 worth of NEAR” | Card / Apple Pay choice and verified NEAR destination; absent merchant setup disables signed checkout. No payment is made. |
| Attach a non-sensitive picture | Private preview; sending it requests NEAR AI Cloud vision. Image instructions cannot authorize a transfer. |
| Open Profile → X | Connect action is setup-gated until owner credentials are present; no posting/DM permissions requested. |
| Connect wallet using Wallets | User completes wallet-provider connection and a domain/nonce-bound NEP-413 proof. Porti never requests a seed phrase. |
| Swap: select NEAR output and Get quote | Dry preview, or explicit registration/provider error. No wallet approval yet. |
| Swap: select Base output and enter destination twice | Wrong network format or differing address confirmation fails; supported route produces an explicitly cross-chain review. |
| Open Stake NEAR | Fixed Meta Pool review; signing remains a separate owner action. |
| Request a transfer with no exact typed recipient/amount | Porti asks for details / rejects preparation, even when an image contains them. |

## Social and financial acceptance

Friend-picture sharing needs two independently authorized workspaces with profiles and an accepted friendship. The current owner-private audience prevents an external friend from using this hosted instance. Unit tests verify membership/block behavior; do not claim a live two-user test was completed here.

Funded demonstrations must be performed by the wallet owner, in small amounts, after provider access works. Record the exact transfer/staking evidence and cross-chain source/destination hashes. Never present mocked tests, an opened checkout or a returned wallet hash as successful payment delivery. See docs/transactions.md for recovery and limitations.

## Known gaps before entry

- Current GitHub repository is private. Public source is required by the event; the owner must separately approve publication after a secret/history review.
- Public demo post on X and completed submission form are not created by this release.
- Owner must supply X/MoonPay credentials and confirm provider-supported account/merchant setup.
- Development requests to 1Click and the holder indexer received HTTP 403. Live hosted routing and full holder checks cannot be claimed from that environment.
- Financial live acceptance, independent security review and recovery drill remain unverified.
- Before broader hosting access, give the Telegram maintenance endpoint independent authorization. The existing unattended updater relies on owner-private hosting.

Architecture, scope and exact setup are in README.md and docs/. Describe only verified behavior in the final submission. Document which code was written after the hackathon announcement and distinguish any pre-existing foundation.
