# Porti submission preparation

Updated 13 November 2026. This prepares assets and wording; it does not publish a post or submit a form.

## Ready assets

- Public app: <https://porti-near.hoymick240.workers.dev/> — choose Try demo, no login needed.
- Public repository: <https://github.com/hoymick/porti-near>.
- [Five authentic screenshots, timed demo script and X post draft](demo/README.md).
- [Reproduction commands](../README.md#run-locally) and [dated verification](verification-2026-11-13.md).
- Production branch: `cloudflare-standalone`. Default `main` contains the submission docs and newer testnet Pocket source. Verify both heads and the actual deployed commit; source and deployed capabilities can differ.

## Owner steps still required

1. Recheck <https://nearhackathon.com/HACKATHON.md>. Current deadline: **14 November 2026, 23:59 UTC** / **15 November, 00:59 WAT**.
2. Review the labelled sample demo and production limits. Do not claim live financial settlement from fixtures/tests.
3. Publish a public X post with video or screenshots saying it was built at **NEAR HACKATHON**, tagging **@NEARProtocol #NEARHackathon**. Keep the hosted app URL accessible. A local-only demo would require video; Porti has a hosted walkthrough.
4. Copy the actual public X post URL. No post URL exists in this draft.
5. Confirm contributor list, contact, payout account, track selection, code provenance and any project-wide license. Git history starts 4 November but includes imported checkpoints, so do not claim every imported line was written in-window merely from timestamps. No pre-announcement baseline tag exists here.
6. Review the exact form payload and submit one project entry before the deadline. These assets have not submitted it for you.

## Form preparation

| Field | Value / owner input |
| --- | --- |
| Name | Porti |
| Public source | https://github.com/hoymick/porti-near |
| Hosted app | https://porti-near.hoymick240.workers.dev/ |
| Public X demo URL | Owner publishes and supplies actual URL |
| Lead, email, team size | Owner confirms; do not invent |
| NEAR payout account | Owner supplies and independently verifies |
| Track | Select based on demonstrated evidence; do not claim perps/lending/vaults |
| Description | Draft below, with verified limits retained |

## Description draft

Porti is a friendly NEAR AI Cloud companion for token research and wallet-reviewed actions. It brings sampled holder evidence, charts, wallet identities and action preparation into one interface. The implementation integrates NEAR Intents / 1Click for supported native-NEAR-source swaps and Meta Pool for reviewed staking. Server checks bind the action's sender, amount, destination and review state; users retain wallet signing authority. Missing provider data and unresolved research checks stay visible. The hosted no-login walkthrough uses explicitly fictional data; latest local app checks passed 264 tests and earlier contract CI passed 25 tests, including mocked providers. Fresh funded settlement was not performed, and optional payment, media and social-provider setup gaps are documented.

Do not claim audited security, complete token coverage, autonomous custody, guaranteed rug detection, implemented perps/lending/vaults, or successful live integrations absent from the verification evidence.
