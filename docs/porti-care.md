# Porti Care: reviewed community donations

Porti Care lets a user submit their own support request, an itemized budget, a verified NEAR recipient wallet and two or three private, redacted evidence pictures. Native NEAR and NEP-141 token contracts with readable metadata are supported. All transfers stay on NEAR mainnet in this feature; a goal's unit is its selected token, not an inferred dollar value.

## Verification and publication

1. The requester explicitly confirms truthfulness, permission to provide evidence, and consent to publish the redacted title/story/budget/token/wallet only after approval.
2. The recipient must already be a wallet-control-verified main/agent account in the requester's workspace. This proves wallet control, not a person's real-world identity or the truth of a claim.
3. At least two **different**, owner-configured reviewers must review the request. Neither can be the requester. Each must record private findings and attest that they independently checked beneficiary relationships, evidence authenticity/source, budget, publication consent and conflicts of interest.
4. The first approval keeps the request pending. A second independent approval opens it. A rejection closes it. Duplicate reviewer votes are rejected, and reviewer removal invalidates the approval quorum for new donations.
5. Recipients, stories, token and evidence are immutable after submission. To change a request, pause it and submit a new one for review. Campaigns expire after 30 days. Requesters or configured reviewers can pause pending/approved requests.

These are review controls, not automated identity verification or fraud certification. The system cannot guarantee document authenticity, need, medical facts, future use of funds or repayment. Human reviewers must actually corroborate evidence with independently obtained sources. Never treat a checked box or uploaded file as sufficient verification. The UI says how many independent approvals were recorded; it does not award a risk-free or government-verified badge.

## Owner setup

Set `PORTI_CHARITY_REVIEWER_IDS` in runtime configuration to a comma-separated list of at least two trusted authenticated account IDs. Each reviewer can find their own identifier in Porti Care's Reviewer configuration panel when setup is missing. Do not use wallet addresses or display names in place of those IDs. Plan reviewer vetting, conflict handling, complaints and escalation before onboarding the community.

No reviewer is assigned automatically, and the requester cannot self-approve. Without two configured reviewers, requests stay pending and donations cannot be prepared. The current Site remains owner-private: this prevents other people from accessing the live review queue. A genuine multi-user review must wait for separately authorized access and independent protection of the Telegram maintenance endpoint. This release does not widen Site access.

## Evidence privacy

Evidence uploads use private R2 scope `charity`. Requesters can access their own evidence; configured reviewers can access evidence only when it belongs to an active pending/approved request. Donors receive no evidence IDs or private findings. Findings are visible to the requester and configured reviewers. Image reads recheck authorization; unsubmitted picture IDs do not grant reviewer access.

Normal uploads resize pictures and strip source metadata in the browser. JPEG/PNG, max 500 KB after resizing; PDFs are not supported in this first flow. Redact identity numbers, addresses, phone numbers and detailed personal records. Do not upload full government IDs, credentials or recovery phrases. Evidence is server-stored and not end-to-end encrypted. Reads expire after 90 days. Configure the `porti/` R2 lifecycle deletion rule documented in commerce-setup.md; expiry alone is not physical deletion. Campaign records and review notes remain in D1 for operational history; deletion/export handling requires a separately reviewed operations procedure.

## Donations and receipt totals

Donations go directly to the immutable reviewed NEAR account. Porti holds no escrow, makes no tax-deductibility claim and cannot claw back a completed transfer. A connected verified donor wallet is required. The server prepares a normal exact-token transfer; the donor reviews and approves through the existing wallet flow. The campaign's status, current independent approvals, recipient/token binding and requester wallet link are checked again before requesting wallet approval. A pause cannot revoke a transaction that has already been signed or broadcast.

Porti counts only donation drafts tied to matching durable finalized transfer receipts. It never labels a prepared review, wallet-returned hash or unconfirmed deposit as raised funds. Original transaction hashes are deduplicated. Totals cover up to 500 matched receipt rows per request and are labeled partial if that bound is exceeded. Direct deposits outside the donation flow are not counted. The shown goal is not a guarantee that it will be met.

## Appearance

Appearance is available at the bottom of the navigation. Auto uses the user's local device time: light from 07:00 to 18:59, dark from 19:00 to 06:59. The app checks every minute and when the tab becomes visible again. Light/Dark overrides are saved on that device until Auto is selected again; no location permission is requested. This is a time schedule, not sunrise/sunset calculation.

## Validation

Tests exercise two-reviewer publication, self-review and duplicate-vote rejection, incomplete evidence/consent, rejection/pause, reviewer removal, wallet unlinking, private evidence access, immutable payment binding, finalized receipt totals and day/night boundaries. Automated fixtures are not live human reviews or funded donation acceptance. No real request was submitted and no donation was executed during development QA.
