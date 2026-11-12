import { reviewSenderAllowed } from './review-wallet.mjs';
// A typed confirmation can only act on the single review in the latest reply.
// Historical cards and model prose never authorize a wallet request.
export function isTransferApproval(text) {
  return /^(?:yes|yes please|approve|approve in wallet|confirm)(?:[.!])?$/i.test(text.trim());
}
export function latestChatTransfer(messages = [], drafts = [], sender, now = Date.now(), roles = {}) {
  const reply = messages.at(-1);
  if (reply?.role !== 'assistant') return null;
  const cards = (reply.cards || []).filter(c => c.type === 'transfer' && c.draft?.id);
  if (cards.length !== 1) return null;
  const shown = cards[0].draft;
  const current = drafts.find(d => d.id === shown.id);
  if (!current || current.status !== 'awaiting_review' || current.expiresAt <= now || !reviewSenderAllowed(current, sender, roles)) return null;
  // Do not approve server details that differ from the card the user saw.
  if (['sender','senderRole','recipient','token','amount','symbol','expiresAt','storageDeposit','rawAmount','recipientVersion','recipientUsername','denomination'].some(k => current[k] !== shown[k])) return null;
  return current;
}
