// Restore the actual provider, never infer signing capability from a cookie.
export async function restoreWalletConnection(connector, expectedAccount) {
  try {
    const { wallet, accounts } = await connector.getConnectedWallet();
    const account = expectedAccount
      ? accounts?.find(a => a.accountId === expectedAccount)?.accountId
      : accounts?.[0]?.accountId;
    if (!wallet || !account || (expectedAccount && account !== expectedAccount)) return null;
    return { wallet, account };
  } catch {
    return null; // Disconnected/locked providers require an explicit reconnect.
  }
}

// Every workflow acquires the same live provider. Only an explicit switch, or
// the absence of a usable connection, may open the wallet selector.
/** @param {any} connector @param {{current?: any, expectedAccount?: string, forceSelect?: boolean, restoreOnly?: boolean}} options */
export async function acquireWalletConnection(connector, { current = null, expectedAccount = undefined, forceSelect = false, restoreOnly = false } = {}) {
  if (!forceSelect) {
    if (current?.wallet) {
      try {
        const accounts = await current.wallet.getAccounts();
        const account = expectedAccount || current.account;
        if (accounts.some(a => a.accountId === account)) return { wallet: current.wallet, account };
      } catch { /* An expired provider must be restored or explicitly connected. */ }
    }
    const restored = await restoreWalletConnection(connector, expectedAccount);
    if (restored) return restored;
  }
  if (restoreOnly) return null;
  const wallet = await connector.connect();
  const accounts = await wallet.getAccounts();
  const account = expectedAccount
    ? accounts.find(a => a.accountId === expectedAccount)?.accountId
    : accounts[0]?.accountId;
  if (!account) throw new Error(expectedAccount
    ? 'Choose the reviewed NEAR account: ' + expectedAccount
    : 'Select a NEAR mainnet account.');
  return { wallet, account };
}

// This is chat context, not signing authority. Transactions still validate the
// live provider, saved ownership proof and exact reviewed sender separately.
export function walletChatState(account, roles = {}, signingAvailable = true) {
  return {
    connectedWallet: account && signingAvailable ? account : null,
    selectedWallet: account || null,
    signingAvailable: !!account && signingAvailable,
    main: roles.main || null,
    agent: roles.agent || null,
    status: account ? (signingAvailable ? 'connected' : 'selected') : 'disconnected',
    requiresTransactionApproval: true,
  };
}

export function walletSetupResult(mode, account, roles = {}, signingAvailable = true) {
  if (mode === 'connect' && account) return {
    output: { ...walletChatState(account, roles, signingAvailable), status: signingAvailable ? 'already_connected' : 'already_selected', note: 'Use this shared wallet account in Porti. No second Porti sign-in or ownership proof is needed. Review actions first; the actual provider is acquired when the user approves. A locked or expired provider may ask to unlock or select the same account before signing.' },
  };
  return {
    card: { type: 'wallet-setup', mode: mode === 'connect' ? 'connect' : 'create' },
    output: { status: 'setup_required', note: mode === 'connect'
      ? 'The Connect a wallet card opens the wallet hub for an existing external wallet.'
      : 'Select Set up your wallet in chat. Enter the password only in the secure wallet form and save the encrypted backup before funding. The browser creates the wallet after the user submits the form.' },
  };
}
