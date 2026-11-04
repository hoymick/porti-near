# Porti v0.8

Porti is a NEAR mainnet research and transfer companion powered by NEAR AI Cloud. It combines a movable anime guide with finalized account reads, partial holder screening, chart readings, wallet-controlled transfers, social chat and Telegram observations.

## Wallet hub

Connect a main wallet and optionally a different user-owned agent wallet. Each role is linked with a short-lived NEP-413 message bound to the Site domain, owner, account and role. The server verifies the signature against a current finalized full-access key and consumes the challenge once. Wallet addresses survive reload; browser wallet connections do not.

Create a wallet opens Meteor's provider. Users complete creation, recovery and any account funding there. Porti does not generate or hold keys, create custodial accounts or grant autonomous spending. Main and agent roles must be distinct. Deposits use the exact NEAR account displayed; native NEAR is supported directly and FT storage requirements still apply.

Fund from main prefills a 1 NEAR transfer to the verified agent account, using the connected main account. Users can edit the amount, review it and approve it in their wallet. Direct transfers from either connected account use the same expiry, balance, price, recipient mapping and finalized receipt checks. No transfer is submitted by the language model.

## Token market readings

Token reports request GeckoTerminal pools for an exact NEAR contract. The selected pool has the largest reported reserve among matching returned candidates. The base/quote side is matched against the exact token relationship. The service accepts 15-minute, one-hour and four-hour candles, drops invalid observations and marks the final forming candle, sorts and deduplicates them, and limits history to 200 candles. Responses are cached for 45 seconds with a bounded cache. The visible chart refreshes every minute, has a manual refresh button, and shows the latest available pool price with its fetch time. Indicators use completed candles only.

The SVG chart shows OHLC and volume. EMA20/50 use SMA seeds; RSI14 uses Wilder smoothing. Prior 20-candle lows/highs provide descriptive support/resistance. Insufficient history, stale observations and trading gaps are visible. These indicators are not predictions, trade recommendations or rug probabilities. Missing provider coverage produces an error rather than fictional live candles. Walkthrough charts are explicitly fictional.

The NEAR AI tools include read_token_chart, wallet_setup and get_linked_wallets. Wallet setup opens a UI card; it cannot create an account by itself. Existing research, watches, recipient resolution, price and transfer-review tools remain bounded and allowlisted.

## Friends and private chat

Verified profiles can request an exact Porti username. The recipient accepts before messaging becomes available. Conversations use stable owner IDs, not usernames. Both parties must retain profiles; reusing an unlinked username does not expose old messages. Blocking or removal revokes server-side read/send access. Insert-time authorization checks prevent a changed friendship from authorizing a send.

Messages are plain text, at most 2,000 characters, and stored on the server without end-to-end encryption. The UI reads the latest 50 messages and polls every ten seconds while visible. Client message IDs make retries idempotent; a two-second per-sender throttle limits rapid sends. Requests have limits and a 24-hour cooldown after removal. Friends also need access to the private Site; GitHub access does not grant Site access.

## Telegram

Users configure a dedicated BotFather bot in a password field. Porti verifies getMe and refuses active webhooks. Tokens are AES-GCM encrypted with owner-bound authenticated data. A unique bot ID prevents sharing one polling bot across owners. Another polling consumer must not use the same bot.

A one-use, ten-minute random Start code binds the private Telegram sender to a candidate account. The signed-in user must confirm the displayed account inside Porti. Group chats are refused. Users can choose holder-risk observations, native balance changes and finalized transfer receipts, pause/resume, disconnect, and send an explicit test. /pause, /resume and /stop are processed on the next check. Native balance changes are not buy detection or a full transfer feed.

Durable outbox entries are deduplicated by owner, link version and event key. Linking changes clear pending messages, and version checks prevent stale link queues from delivery. Each check sends up to three messages. A positive Telegram message ID is required before recording delivery. A per-bot lease fences concurrent runners; provider cooldowns, terminal errors and at most five attempts bound retries. Events expire after seven days; the pending queue is capped at 200. A network loss after Telegram accepted a message can still cause a duplicate. Exactly-once external delivery is not promised.

The current UI supports per-check category delivery. Quiet hours and daily digest helpers retained from earlier work are not wired into this release's delivery UI or runner.

## Background updater

POST /api/porti/telegram/run uses the owner-private Sites dispatcher boundary; it does not impersonate a visitor. The shared endpoint must not be exposed publicly without independent authorization. It refreshes one oldest due watch for each of up to three bot workspaces per run. A five-minute global lease and bot leases bound overlapping work. Each watch is attempted at most once per 15 minutes; large watchlists rotate more slowly. Failed reads produce no invented observations. GET reads persisted run metadata.

The UI reports a schedule only after a real task ID has been registered, and records actual checks separately. Credentials are never put in schedule prompts. User setup still requires a bot token and private account linking.

The hosted scheduler permits a maximum of one run per hour. An enabled hourly task is registered; manual checks remain available between runs. The service writer was exercised with private service access and its persisted result read back. No bot was configured during this check, so delivery itself remains unverified.

## Deployment and validation

Apply all journal migrations in order. Earlier paused Telegram tables remain for compatibility; active v0.8 tables use the porti_telegram prefix. Preserve PORTI_SETTINGS_KEY across deployments. Previously configured credentials under a different derivation require migration or re-entry. The live account was checked before the new root was configured: no user AI, RPC or indexer keys were saved.

Automated verification includes TypeScript, Node tests and production packaging. Integration tests execute the feature services against real SQLite with mocked Telegram and market HTTP responses. They cover cross-user access, username reuse, blocked chats, proof replay, queue acknowledgements, cooldowns, dedicated bot uniqueness and exact market-side selection. These checks do not replace live bot delivery, actual NEAR AI inference or a wallet owner's funded transaction acceptance.
