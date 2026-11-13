# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

- **Hackathon judges (primary, now):** NEAR Hackathon reviewers evaluating the entry before the 14 Nov 2026 23:59 UTC deadline and during judging (16–18 Nov). They need to understand the security claim quickly and try it without funding a wallet.
- **NEAR users:** people who research tokens, follow wallets and move NEAR, who want help from an AI without handing it signing power.
- **Feature-phone users (Porti Pocket):** people who spend small amounts of NEAR over USSD from any phone.

## Product Purpose

Porti is a NEAR AI Cloud companion that puts token research, wallet monitoring and reviewed financial workflows (transfers, staking, swaps, buying NEAR) in one place, while the user keeps signing authority. Porti Pocket extends this to any phone over USSD, spending from a small, capped onchain pocket.

## Positioning

Explicit authority boundaries:
1. **Porti AI proposes only.** It holds no key and cannot sign.
2. **The pocket (USSD) spends only within onchain caps.** Per-send and daily limits are enforced by the pocket contract. The server's key can call only `send` and `freeze`.
3. **The main wallet has full control.** It withdraws, unfreezes and changes limits.

Model suggestions, server-validated reviews, wallet signatures and observed onchain evidence are kept distinct, and missing provider data is reported honestly rather than invented.

## Operating Context

- Next.js-style app on vinext / Cloudflare Workers with D1 and R2. Standalone defaults to public landing/demo and NEAR-wallet sessions; Cloudflare Access is optional. The original owner-private Sites deployment is separate. USSD routes have their own channel/authentication controls.
- The signed-out home is the landing page. Signed-in users get the workspace. A fictional "Walkthrough" mode exists.
- Judges can try a separately configured NEAR testnet Phone Pocket through the in-app simulator (`+999` numbers, `/api/ussd/sim`). Real phone callbacks and ordinary financial workflows stay on mainnet.

## Capabilities and Constraints

- Verified: research adapters, NEP-413 wallet proofs, username-linked recipients, reviewed transfers and Meta Pool staking reviews, chat with bounded tools, the USSD menu and Balance. The pocket contract's caps and key restrictions were proven on a local NEAR sandbox.
- **Not yet verified:** funded mainnet transfers, staking, swaps and purchases; real-user USSD Send/Freeze/history acceptance; the live Africa's Talking callback; an independent security audit. These must not be claimed as working.
- Ordinary wallet/research workflows and live USSD require mainnet; the isolated simulator requires testnet (local sandbox exception in dev only).

## Brand Commitments

- Name: **Porti**. "Porti Pocket" for the USSD feature.
- Original anime companion artwork (in-app companion sprite, `public/porti-guide.png`). NEAR-inspired mint, black and white. Fredoka and Nunito, licensed in `public/fonts`.
- Independent project: integrations do not imply official partnerships.
- Voice: friendly, plain and honest about limits.

## Evidence on Hand

- 264 app tests passed on `b297504`; 25 contract unit tests passed in prior CI. [Dated verification](docs/verification-2026-11-13.md).
- Sandbox proof: with the server key, a 0.05 send was allowed; a 0.2 send was refused by the cap; `withdraw` and `set_limits` were refused by the key's method list.
- No testimonials, customers, usage numbers or press exist. Do not fabricate any.

## Product Principles

1. The AI never signs. Every movement of funds has a human or contract boundary.
2. Show evidence, not confidence: label sources, limits and unknowns.
3. Claim only what has been verified.
4. Small, capped risk beats convenience without limits.

## Accessibility & Inclusion

Feature-phone and low-bandwidth users are a real audience for Porti Pocket. Pages must work at phone width and in light and dark themes.
