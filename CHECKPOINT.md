# Porti v0.14 checkpoint

Adds owner-configured X OAuth, signed MoonPay checkout preparation, private image attachments in Porti/friend chat, NEAR markets tables, and native-NEAR-source same/cross-chain 1Click swap reviews. Ethereum, Base, Arbitrum and BNB Chain are supported destination network families, conditional on the live catalog and quote. Existing Meta Pool staking and NEAR transfer evidence remain in place. Chat can open dedicated workflows, read market snapshots and cannot derive transfer authority from images.

Setup: docs/commerce-setup.md. Transaction/recovery boundaries: docs/transactions.md. Judge walkthrough: HACKATHON.md. Submission preparation: docs/hackathon-submission.md.

145 automated tests, type checking, lint (0 errors; known `any`/React-hook debt tracked as warnings) and the build pass at this checkpoint. Live funded acceptance was not performed. X/MoonPay credentials and trusted customer-IP configuration are owner tasks. Development 1Click catalog access returned HTTP 403. Image reads expire at 90 days; R2 lifecycle deletion must be configured. Site and repository remain private; no X post or hackathon submission was made.

Current additions: setup-gated Seams internal wallet creation/unlock (docs/internal-wallet.md), Porti Care community requests and two-reviewer donation publication (docs/porti-care.md), and local-time automatic day/night with manual override. Owner must provision a compatible Seams service and configure independent charity reviewers; no real wallet creation, review or funded donation was performed.
