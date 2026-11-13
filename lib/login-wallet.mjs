import { sessionAccount } from './near-session.mjs';
import { mutateWorkspace } from './store.mjs';
import { DomainError } from './errors.mjs';

// The login already verified a full-access NEP-413 proof. Only reuse it in
// that account's own workspace; never accept a client-supplied wallet address.
export async function linkLoginWallet(db, cookie, ownerId, initialState) {
  const account = await sessionAccount(db, cookie);
  if (!account || ownerId !== 'near:' + account)
    throw new DomainError('SIGN_IN_REQUIRED', 'Sign in with your NEAR wallet first.', 401);
  const { result } = await mutateWorkspace(db, ownerId, state => {
    state.porti ??= initialState();
    const roles = state.porti.walletRoles ??= {};
    if (roles.main?.account && roles.main.account !== account)
      throw new DomainError('WALLET_CONFLICT', 'Your main wallet is different. Change it in Wallets to use your sign-in wallet.', 409);
    if (roles.agent?.account === account)
      throw new DomainError('SAME_WALLET', 'Your agent and main wallet must be separate accounts.', 409);
    roles.main ??= { account, verifiedAt: Date.now() };
    return roles.main;
  });
  return result;
}
