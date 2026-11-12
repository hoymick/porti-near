import { DomainError } from './errors.mjs';

export function assertTransferSourceRole(roles, role, sender) {
  if (role == null) return;
  if (!['main', 'agent'].includes(role) || !roles?.[role]?.verifiedAt || roles[role].account !== sender)
    throw new DomainError('SOURCE_WALLET_CHANGED', 'The verified source wallet changed. Prepare a fresh transfer review.', 409);
}

export function reviewSenderAllowed(review, selected, roles = {}) {
  if (!review) return false;
  if (review.senderRole != null) {
    try { assertTransferSourceRole(roles, review.senderRole, review.sender); } catch { return false; }
  }
  return review.sender === selected || ['main', 'agent'].includes(review.senderRole);
}

// Called only after an explicit approval. Resolving a signer never submits a
// transaction, and unlocking cannot resume a prior approval automatically.
/** @param {{expectedAccount:string,candidates?:any[],localAccount:()=>Promise<any>,openLocal:()=>void,acquireExternal:()=>Promise<any>}} options */
export async function acquireReviewedWallet({ expectedAccount, candidates = [], localAccount, openLocal, acquireExternal }) {
  for (const wallet of candidates.filter(Boolean)) {
    try {
      if ((await wallet.getAccounts()).some(a => a.accountId === expectedAccount)) return wallet;
    } catch { /* Locked adapters remain unusable until the user unlocks them. */ }
  }
  if (await localAccount() === expectedAccount) {
    openLocal();
    throw new Error('Unlock your agent wallet below and choose “Use as agent wallet”. Then return to the review and approve again. Nothing has been sent.');
  }
  const wallet = await acquireExternal();
  if (!(await wallet.getAccounts()).some(a => a.accountId === expectedAccount))
    throw new Error('Choose the exact sender shown in the transfer review.');
  return wallet;
}
