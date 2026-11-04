# Porti development checkpoint

Source checkpoint prepared for collaborator review on 4 November 2026. This repository contains only the Porti NEAR product and its supporting application infrastructure.

## Current work

Telegram development is paused. Source includes dedicated-bot verification, a short-lived private connection link, confirmation in Porti, alert preferences, an outbox and a polling runner. These are in-progress implementations, not a claim of working production Telegram delivery. No bot token or background schedule has been configured, and live delivery has not been acceptance-tested.

The existing NEAR companion, profile proofs, research adapters and transfer-review logic are retained. NEAR AI Cloud needs credentials, the last public RPC check failed, and funded wallet acceptance remains outstanding.

## Before the next deployment

1. Set a high-entropy `PORTI_SETTINGS_KEY` and the real `PORTI_APP_URL` in secure runtime settings. Existing encrypted credentials from another scheme require migration or re-entry.
2. Apply database migrations in order to a test database.
3. Review Telegram queue concurrency, retry behavior, digest overflow, retention and command processing.
4. Configure a dedicated bot without another webhook or polling consumer; verify linking, account confirmation, pause, resume, stop and delivery.
5. Establish and verify the private unattended updater path, then create a background schedule. Until then, checks require manual invocation.
6. Complete real inference and wallet-controlled acceptance scenarios before financial use.

The shared Telegram runner relies on an owner-private hosting access boundary. Do not expose it publicly without independent runner authorization. The live deployment was not changed by this repository cleanup.
