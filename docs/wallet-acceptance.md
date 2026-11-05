# Wallet acceptance checkpoint — 5 November 2026

Source inspected: `f9a403086d7c80d36c9afc1dcde5d135d2a74669` (v0.14.0), newer than the supplied source checkpoint. This review corrects stale activation instructions and Overview references to the removed bubble map and complete top-holder rankings.

## Verification

- Restored text source from the private GitHub repository. No production wallet, password, encrypted backup or API secret was accessed.
- `npm test`: 105 passed, zero failed. Includes encrypted backup recovery, incorrect passwords, tampering, NEP-413 ownership signatures, exact signed transaction bytes, cancellation, lock-during-approval, journal failures and uncertain broadcasts.
- `npm run check`: passed after all source files were restored.
- `npm run build`: passed. This local snapshot excludes public binary artwork/fonts; its output is not a complete deployment artifact or visual verification. Existing repository assets are unchanged.
- Live checks blocked: the supplied Site ID returned project-not-found in the current account, and the accessible Site list was empty. Current hosting privacy and deployment were not independently verified or changed.

## Owner-run wallet test

No transaction is authorized by this document. Perform each step personally in the existing wallet; do not share passwords, backups or recovery material in chat.

1. Unlock the existing device wallet. Fund wallet and Copy funding address must show the same complete existing account ID. Do not create a replacement wallet.
2. Preserve the encrypted backup and password separately. For recovery, use an isolated browser profile on the same trusted app origin. Restore the original backup locally, compare the full address, then lock it. Restoration must never overwrite another wallet. The backup does not carry the pending-transaction journal; reconcile existing hashes before signing on another device.
3. Refresh balance. An absent account must show Awaiting first deposit; an existing zero-balance account must show 0 NEAR. RPC failures must remain errors rather than become a zero balance or a funding instruction.
4. If desired, personally fund the exact address with native NEAR on NEAR mainnet. Keep enough for the chosen transfer plus fees and Porti's buffered reserve. This is optional and requires separate owner approval.
5. Select Verify and use as agent wallet. Cancel the ownership signature first; no role should be linked by that attempt. Retry and approve only after reviewing the account, domain and message. The server must verify the current full-access key.
6. Prepare a native transfer of **0.001 NEAR** to an existing main-wallet account controlled by the owner. Confirm the recipient's full address personally; no destination has been preselected. Review sender, recipient, exact amount and fees. Cancel at the signature screen and check wallet history before any retry.
7. Cancellation blocks local signing/broadcast, but the application review can remain wallet_requested. Do not reset a pending review, delete its journal or assume a timeout proves cancellation. Safe recovery of known pre-broadcast cancellation at the application level remains a follow-up task.
8. Only after explicit owner approval, prepare an eligible fresh review and approve its signature personally. Preserve the original hash. Verify final execution and exact sender, receiver and amount through Porti's receipt checker. A returned hash alone is not success. If status is unknown, reconcile the original hash without resending.

## README claim audit

| Area | Source behavior | Evidence still needed |
| --- | --- | --- |
| Funding/balance | Funding panel reads the existing vault address; refresh uses mainnet finalized account/key checks and raw balance | Real browser copy, balance refresh and first deposit |
| Research/charts | Provider-backed metadata/charts; holder candidates require finalized balance checks | Live provider coverage and known-token comparison |
| Top traders | Up to 20 wallets ranked from returned recent swaps in one selected pool; not profit or complete market activity | Real provider response and explorer comparison |
| Risk | Partial concentration screening; missing permissions, sellability and liquidity checks stay unknown; probability is null | Independent provider evidence; no safety guarantee |
| Staking | Fixed Meta Pool call, reviewed amount, final matching receipts and mint event required | Owner-approved funded stake and verified mint; cancellation recovery |
| Swaps | Bound catalog/quote/recipient/refund, one funding request, provider-reported settlement | Funded acceptance and independent destination evidence |
| Telegram | Private link confirmation, durable queue, bounded delivery retries and acknowledged message IDs | Live linked workspace and authorized alert delivery; zero-workspace runs prove no delivery |

MoonPay and X need owner configuration. Two-user social acceptance and independent charity reviewers remain outstanding. Long/short trading is absent. Public access and hackathon submission are not authorized by this checkpoint.
