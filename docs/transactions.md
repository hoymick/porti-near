# Porti transaction model

## Same-chain transactions

The existing NEAR transfer screen prepares native NEAR or NEP-141 transfers to a verified platform username or explicit account. It retains strict finalized transaction/event reconciliation. The staking screen prepares `deposit_and_stake` on `meta-pool.near`; see [staking](staking.md) for reference-price and exit limitations.

The Swap screen also supports native NEAR to a different NEAR-mainnet catalog token delivered to the connected sender. Any output-token registration requires a separate explicit wallet approval. No arbitrary token-to-token source, leveraged long/short, unstaking or automatic trade is implemented.

## Cross-chain delivery

Native NEAR can be routed into provider-supported destination tokens on Ethereum (`eth`), Base (`base`), Arbitrum (`arb`) and BNB Chain (`bsc`). The catalog and an executable quote, not this list, determine whether a particular route exists. Other output chains and reverse EVM-to-NEAR funding are not enabled. EVM addresses are syntax-checked, nonzero and entered twice; Porti does not prove control of an EVM recipient or support memo-dependent exchange deposits.

1. The server verifies ownership of the linked NEAR source wallet and reads the live catalog. All asset IDs come from that catalog.
2. The user specifies native NEAR amount (greater than zero, max 100 NEAR), output token/network, slippage and cross-chain destination address. Refunds stay bound to the verified NEAR sender.
3. A dry exact-input quote creates a saved preview, without a deposit or wallet request. The review expires within 90 seconds and shows expected/minimum output.
4. An explicit review checkbox and Prepare action request an executable quote. Exact request echoes are validated; a lower minimum than reviewed is rejected. The earliest request deadline, provider deadline and inactive time governs expiry.
5. The second review includes the exact NEAR deposit address, output network/address, registration cost and buffered gas reserve. Another explicit checkbox precedes wallet approval.
6. Funding state is consumed atomically. The wallet receives one transaction to `wrap.near`: optional capped sender registration, `near_deposit`, then `ft_transfer` of the exact wNEAR amount to the provider deposit address. No contract address, method or deposit is supplied by model text.
7. Saved orders survive redirect. Users can supply their original NEAR hash and check provider status; neither the hash nor the deposit proves destination delivery.

## Outcome evidence and recovery

Swap status validates the quoted recipient, refund, assets, raw input and deposit address against the saved order. Explorer URLs are built locally from an allowlisted chain and validated hash, never trusted from provider-supplied URLs. Status is labeled **provider-reported**. Independent destination-chain receipt/balance verification is not implemented, so a `SUCCESS` response is not presented as Porti-verified finality. Original-chain transaction links are not labeled refunds without evidence.

Only an unsent preview/executable review can be cancelled. Once wallet approval has been requested, do not issue a replacement deposit automatically; check the original wallet transaction and provider outcome. A pending order blocks another funding review from the same sender. Pending orders are retained when recent completed previews are pruned. A timeout does not authorize resubmission. Refunds are handled by the provider according to its terms; Porti does not guarantee recovery or timing.

All browser mutations require authenticated ownership, same-origin JSON and durable quotas. Provider requests have size/time limits; HTTP 403/429 creates a cooldown. Missing catalog/quote/status fails visibly. UI walkthrough mode cannot execute financial actions.

## Chat authority

NEAR AI Cloud can open workflow cards and prepare transfer reviews; it cannot sign, spend or approve. A transfer's exact recipient and amount must occur in the user's typed message. An uploaded image or its generated description is untrusted context, never payment authority. Purchase cards ask for payment method and hand off to a fixed secure provider. Keys and card data do not belong in chat.

## What was tested

Automated cases cover catalog filtering, same-chain recipient restrictions, explicit EVM destination confirmation, quote echo/expiry/minimum checks, worse-price rejection, owner isolation, one-time funding, cancel rules, pending-order exclusion, chain-bound output links and typed transfer intent. No funded swap, stake, purchase or cross-chain transfer was executed during development QA. Owner acceptance and an independent security review remain required.
