# Porti staking

Porti supports a user-approved NEAR mainnet liquid-staking deposit into `meta-pool.near`. Open Wallet → Stake NEAR, or use the Meta Pool app shortcut. Amounts are limited to 1–100 NEAR per review.

The server verifies that the sender is a linked main/agent wallet, checks finalized balances and account storage, obtains a current gas price and reserves a buffered network fee. A two-minute review records the amount, sender, fixed contract and its code hash. The stNEAR output uses the current contract reference and is an estimate: `deposit_and_stake` does not enforce a minimum output.

The wallet request contains exactly one FunctionCall: `deposit_and_stake`, empty JSON arguments, 100 Tgas, and the reviewed NEAR deposit. Porti holds no signing keys. The user reviews and approves in the connected wallet. No staking transaction was executed during development verification.

Before requesting wallet approval, the server rechecks the verified wallet role, balance and contract code hash. Approval state is consumed atomically and cannot be reused. A pending staking request prevents preparing another stake from the same sender until the original is reconciled. After cancellation, timeout or wallet redirection, users must inspect their wallet history and verify the original hash rather than blindly submit a replacement. Automatic resubmission is not supported.

Users can reopen their saved staking review and enter its original hash. Verification requires finality FINAL, exact transaction identity/signer/receiver/action/deposit/gas/empty args, a complete successful receipt chain, an execution time matching the review, and a positive NEP-141 ft_mint event from Meta Pool to the sender. Receipts are written using the existing durable owner/hash and owner/draft uniqueness constraints.

The feature does not implement validator selection, native validator delegation, unstaking, withdrawing or instant exits. These require separate reviewed implementations. Use Meta Pool for exits; protocol risk, stNEAR market-price risk, fees and waiting periods apply. Actual mint output is reported from receipt evidence, not inferred from a reference rate or a wallet-returned hash.

Source interface: https://github.com/Meta-Pool/liquid-staking-contract/blob/master/metapool/src/lib.rs (`deposit_and_stake` emits an FtMint event).

Live funded wallet acceptance remains untested; automated tests do not replace it. The Site remains private.
