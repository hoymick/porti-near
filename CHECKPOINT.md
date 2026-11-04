# Porti v0.12 checkpoint

Adds owner-configured X OAuth, signed MoonPay checkout preparation, private image attachments in Porti/friend chat, NEAR markets tables, and native-NEAR-source same/cross-chain 1Click swap reviews. Ethereum, Base, Arbitrum and BNB Chain are supported destination network families, conditional on the live catalog and quote. Existing Meta Pool staking and NEAR transfer evidence remain in place. Chat can open dedicated workflows, read market snapshots and cannot derive transfer authority from images.

Setup: docs/commerce-setup.md. Transaction/recovery boundaries: docs/transactions.md. Judge walkthrough: HACKATHON.md. Submission preparation: docs/hackathon-submission.md.

82 automated tests pass at this checkpoint; type checking passes. Live funded acceptance was not performed. X/MoonPay credentials and trusted customer-IP configuration are owner tasks. Development 1Click catalog access returned HTTP 403. Image reads expire at 90 days; R2 lifecycle deletion must be configured. Site and repository remain private; no X post or hackathon submission was made.
