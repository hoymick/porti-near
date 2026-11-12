// The upstream OKX executor filters actions to FunctionCall before signing.
// Native Transfer (and other action types) must never reach that adapter.
export function walletTransactionIssue(wallet, transaction) {
  const id = wallet?.manifest?.id || wallet?.id;
  if (id !== 'okx-wallet') return '';
  if (!Array.isArray(transaction?.actions) || !transaction.actions.length ||
      transaction.actions.some(action => action.type !== 'FunctionCall')) {
    return 'The current OKX connection supports contract calls only. It cannot send native NEAR through Porti. No transaction approval was requested for this attempt. Use a compatible signing provider for this same sender, or use Send inside OKX after checking the outcome of any earlier attempt. Porti has not changed the token or recipient.';
  }
  return '';
}
export function assertWalletTransactionSupported(wallet, transaction) {
  const issue = walletTransactionIssue(wallet, transaction);
  if (issue) throw new Error(issue);
}
export function transferSigningError(error, walletRequested, hash) {
  const reason = typeof error?.message === 'string' ? error.message.slice(0, 500) : 'Wallet request failed.';
  if (!walletRequested) return reason;
  if (hash) return `Your wallet returned transaction hash ${hash}, but final verification did not complete. Open Details / verify outcome and verify this original hash; do not send again. ${reason}`;
  return `The wallet request failed or returned an unknown outcome. Porti has not verified a successful transfer. Open Details / verify outcome and check the original wallet transaction before retrying. Wallet error: ${reason}`;
}
