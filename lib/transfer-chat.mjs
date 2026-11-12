import { nearAccountOK } from './near-core.mjs';

const TTL = 5 * 60_000;
const cancelled = text => /\b(?:cancel|stop|never|do not|don't|dont)\b/i.test(text);
const norm = text => text.toLowerCase().trim().replace(/[.!?]+$/, '').trim();
function target(text) {
  const t = norm(text).replace(/^(?:my|the)\s+/, '');
  if (/^(?:agent|device)(?: wallet)?$/.test(t)) return { role: 'agent' };
  if (/^main(?: wallet)?$/.test(t)) return { role: 'main' };
  if (/^porti(?: wallet)?$/.test(t)) return { ambiguous: true };
  if (nearAccountOK(t)) return { account: t };
  return null;
}

// Only typed user text can create this short-lived intent. Assistant text,
// image content and guessed destinations never become transfer authority.
/** @param {string} message @param {any} pending @param {any} options */
export function transferChatIntent(message, pending, { wallet, roles = {}, now = Date.now(), imageId } = {}) {
  const text = norm(message);
  if (cancelled(text)) return { handled: !!pending || /\b(?:send|transfer|pay)\b/.test(text), pending: null, content: 'Transfer request cancelled. No transaction was signed or sent.' };
  if (imageId) return { handled: false, pending: null };
  const start = text.match(/^(?:(?:good|ok|okay|hi porti|porti)[, ]+)?(?:please\s+)?(?:send|transfer)\s+(\d+(?:\.\d+)?)\s+(?:native\s+)?near(?:\s+from\s+(.+?))?\s+to\s+(.+)$/);
  let intent;
  if (start) {
    const destination = target(start[3]);
    if (!destination) return { handled: false, pending: null };
    if (start[2]) {
      const source = target(start[2]);
      const sourceAccount = source?.role ? roles[source.role]?.account : source?.account;
      if (!source || source.ambiguous || !nearAccountOK(sourceAccount) ||
          (source.role && !roles[source.role]?.verifiedAt) || sourceAccount !== wallet) {
        return { handled: true, pending: null, content: 'Select the verified source wallet named in your request, then try again. No transfer review was created.' };
      }
    }
    intent = { amount: start[1], sender: wallet, destination, expiresAt: now + TTL };
  } else {
    if (!pending || pending.expiresAt <= now || pending.sender !== wallet) return { handled: false, pending: null };
    const clarify = text.match(/^(?:(?:send|transfer)(?: it)? to\s+)?((?:(?:my|the)\s+)?(?:agent|device|main)(?: wallet)?)(?:\s+(?:should\s+)?(?:receive|recieve)(?: it)?)?$/);
    if (clarify) intent = { ...pending, destination: target(clarify[1]) };
    else if (/^(?:yes|yes please|confirm|confirmed|yes confirm)$/.test(text)) intent = pending;
    else return { handled: false, pending: null }; // New topics invalidate old intent.
  }
  if (!nearAccountOK(intent.sender)) return { handled: true, pending: null, content: 'Select your signed-in NEAR wallet first, then ask for the transfer again.' };
  if (intent.destination.ambiguous) return { handled: true, pending: intent, content: `Send ${intent.amount} native NEAR from ${intent.sender} to which wallet: your agent wallet, or another exact NEAR account? Reply “agent should receive it” or type a new complete request. No transfer review has been created yet.` };
  const role = intent.destination.role;
  const linked = role ? roles[role] : null;
  if (role && (!linked?.verifiedAt || !nearAccountOK(linked.account))) return { handled: true, pending: null, content: `Link and verify your ${role} wallet in Wallets first, then ask again. No transfer review was created.` };
  const recipient = linked?.account || intent.destination.account;
  if (!nearAccountOK(recipient) || recipient === intent.sender) return { handled: true, pending: null, content: 'The recipient must be a different exact NEAR account from your selected sender. No transfer review was created.' };
  return { handled: true, pending: null, transfer: { sender: intent.sender, recipient, token: 'near', amount: intent.amount, denomination: 'token', ...(role ? { recipientRole: role } : {}) } };
}

// Financial status is rendered from backend evidence, never model prose.
export function transferChatReply(text, cards = [], steps = []) {
  const card = cards.find(c => c.type === 'transfer' && c.draft?.id);
  if (card) return `Your review for ${card.draft.amount} ${card.draft.symbol} from ${card.draft.sender} to ${card.draft.recipient} is ready below. Open “Review ${card.draft.amount} ${card.draft.symbol}”, check the details, then approve in your wallet. Nothing has been signed or sent.`;
  const failed = steps.find(s => s.tool === 'prepare_transfer' && s.status === 'failed');
  if (failed) return `No transfer review was created. ${failed.message || 'Preparation failed. Please try a new complete request.'} Nothing has been signed or sent.`;
  if (cards.some(c => c.type === 'workflow' && c.screen === 'Transfers')) return 'The Open Transfers button below opens the transfer form. No transfer review was created in this turn. Enter the recipient and amount there, or type a complete transfer request here.';
  if (cards.length) return text;
  if (/\b(?:prepared|created)\b.{0,35}\b(?:transfer|review|card)\b|^(?:i(?:'ve| have)?\s+)?prepared[.!✅\s]|(?:review|transfer|confirmation)\s+card.{0,35}(?:ready|showing|created)|(?:created|ready).{0,35}(?:review|transfer)\s+card/i.test(text)) return 'No new transfer review was created in this turn. Type a complete transfer request, or reopen an existing review in Transfers. Nothing has been signed or sent.';
  return text;
}
