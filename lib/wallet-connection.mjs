// Restore the actual provider, never infer signing capability from a cookie.
export async function restoreWalletConnection(connector, expectedAccount) {
  try {
    const { wallet, accounts } = await connector.getConnectedWallet();
    const account = accounts?.[0]?.accountId;
    if (!wallet || !account || (expectedAccount && account !== expectedAccount)) return null;
    return { wallet, account };
  } catch {
    return null; // Disconnected/locked providers require an explicit reconnect.
  }
}
