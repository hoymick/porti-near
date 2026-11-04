# WIF PORT Scout v0.4

The primary product is now onchain scouting for Robinhood Chain (4663), replacing the document demo as the homepage. Porti, Fredoka/Nunito and the cartoon visual system remain.

## Functional scope

- Wallet investigations: metadata, indexed token balances, latest 50 transfers, up to four transaction interpretations with raw Swap topic signatures and opposing wallet ERC-20 flows. Complex and native routes remain unresolved.
- CA investigations: ERC-20 metadata, newest transfer page, up to 50 holder entries and top-10 concentration against reported total supply. Holder concentration includes pools, contracts and burns; it is not an insider percentage.
- Radar: watched-token transfer activity, 15-minute recipient counts, observed pace compared with the previous 45 minutes in a one-hour sample. Recipients are not buyers and busy tokens may truncate the window. Token directory browsing is discovery of indexed contracts, not a quality ranking.
- Durable owner-scoped watchlists and snapshots in existing D1 workspace storage. Three free slots; pause/resume/remove; one due watch per visible-tab timer tick. First observation is a baseline. Subsequent new transfer IDs produce deduplicated in-app observations. No closed-tab job, push, email or Telegram delivery.
- Scout Pass: at least 100 canonical WIF, wallet ownership proof and chain-4663 RPC balance check. 25 watch slots and 60-second minimum refresh for one hour, then re-verification required. This is balance-gated access, not a deposit, token purchase or stake. Free minimum is 300 seconds. Excess watches are preserved but not refreshed after expiry.
- Encrypted owner-provided Blockscout Pro key. Existing encrypted RPC setup is reused. Settings never expose stored key material. Fixed provider domains, authenticated same-origin mutations, bounded inputs. No arbitrary URL proxy.
- Reports export observed JSON with provenance, check times, coverage and warnings. React escapes all untrusted token strings.
- Explicit fictional sample mode. Sample observations do not enter live state or open fake explorer links.

## Long / Short desk

Official Robinhood documentation identifies the separate Robinhood Chain Lighter deployment at https://robinhoodchain.lighter.xyz with API base https://api.rh.lighter.xyz. The desk reads active perpetual markets from its orderBookDetails endpoint; it does not reuse Lighter Core market listings. Live plans remain blocked when the feed fails or cannot be recognized.

Direction, margin, 1–5x planning leverage, stop and target produce notional, quantity and scenario PnL. Estimates exclude fees, funding, slippage and maintenance margin. A stop beyond the posted margin loss is rejected; the planner is not a liquidation model. References expire after 60 seconds. Plans can be exported as explicitly unsubmitted JSON. The venue handoff opens the official venue; it does not send/prefill an order.

**Direct agent execution is not implemented.** It requires venue account integration, delegated signer setup, exchange-specific limits, collateral/precision/margin validation, nonce management, order/fill reconciliation, cancellation and integration testing before activation. No exchange credentials, wallet seeds or funds were used. WIF Pass does not fund venue margin.

## Verified and blocked

- Core tests cover transfer classification, incomplete/reverted/self/multi-asset routes, missing holders, integer formatting, snapshot baselines and deduplication, sample isolation, long/short PnL and rejected risk inputs.
- TypeScript and production build are required before publication.
- Public explorer and DEX Screener HTTP probes returned 403 from this development environment. A verified owner key and working production connection are needed for actual observations. No live-market or profitable-wallet result has been fabricated.
- Model inference is not connected. Signals are deterministic, evidence-based heuristics.
- Existing document contracts and source are retained as legacy groundwork, not advertised as the scout’s execution backend. Current Scout does not call the vault or charge real WIF.

## Sources

https://docs.robinhood.com/chain/connecting/
https://docs.robinhood.com/chain/lighter-domains/
https://www.blog.blockscout.com/build-on-robinhood-chain-with-the-blockscout-pro-api/
https://docs.blockscout.com/api-reference/get-address-token-transfers
https://docs.blockscout.com/api-reference/get-token-holders
https://docs.blockscout.com/api-reference/get-transaction-logs
https://github.com/elliottech/lighter-python/blob/main/lighter/models/order_book_details.py
