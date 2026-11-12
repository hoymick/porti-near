import { nearAccountOK } from './near-core.mjs';

const TTL = 5 * 60_000;
const cancelled = text => /\b(?:cancel|stop|never|do not|don't|dont)\b/i.test(text);
const norm = text => text.toLowerCase().replace(/\s+/g, ' ').trim().replace(/[.!?]+$/, '').trim();
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
  const start = text.match(/^(?:(?:good|ok|okay|hi porti|porti)[, ]+)?(?:please\s+)?(?:send|transfer)\s+(\d+(?:\.\d+)?)\s+(?:native\s+)?near\s+(?:back\s+)?(.+)$/);
  let intent;
  if (start) {
    // Support both "from agent to main" and "back to main from agent".
    // Only exact, complete targets are accepted; never split off extra actions.
    const sourceFirst = start[2].match(/^from\s+(.+?)\s+(?:back\s+)?to\s+(.+)$/);
    const destinationFirst = sourceFirst ? null : start[2].match(/^to\s+(.+?)(?:\s+from\s+(.+))?$/);
    const sourceText = sourceFirst?.[1] || destinationFirst?.[2];
    const destinationText = sourceFirst?.[2] || destinationFirst?.[1] || '';
    const destination = target(destinationText);
    // Username transfers retain the existing profile-resolution flow.
    if (!destination && /^@[a-z][a-z0-9_]{2,19}$/.test(destinationText)) return { handled: false, pending: null };
    if (!destination) return { handled: true, pending: null, content: 'Specify one exact native NEAR transfer, for example: “send 0.1 NEAR to my main wallet from my agent wallet”. Use a different exact NEAR account or a linked wallet role. No transfer review was created.' };
    let sender = wallet, senderRole;
    if (sourceText) {
      const source = target(sourceText);
      const sourceAccount = source?.role ? roles[source.role]?.account : source?.account;
      if (!source || source.ambiguous || !nearAccountOK(sourceAccount) ||
          (source.role && !roles[source.role]?.verifiedAt) || (!source.role && sourceAccount !== wallet)) {
        return { handled: true, pending: null, content: `Select and verify ${source?.role ? `your ${source.role} wallet` : 'the source wallet named in your request'} in Wallets, then send this request again. No transfer review was created.` };
      }
      sender = sourceAccount;
      senderRole = source.role;
    }
    intent = { amount: start[1], sender, selectedAccount: wallet, ...(senderRole ? { senderRole } : {}), destination, expiresAt: now + TTL };
  } else {
    if (!pending || pending.expiresAt <= now || (pending.selectedAccount || pending.sender) !== wallet) return { handled: false, pending: null };
    const clarify = text.match(/^(?:(?:send|transfer)(?: it)? to\s+)?((?:(?:my|the)\s+)?(?:agent|device|main)(?: wallet)?)(?:\s+(?:should\s+)?(?:receive|recieve)(?: it)?)?$/);
    if (clarify) intent = { ...pending, destination: target(clarify[1]) };
    else if (/^(?:yes|yes please|confirm|confirmed|yes confirm)$/.test(text)) intent = pending;
    else return { handled: false, pending: null }; // New topics invalidate old intent.
  }
  if (!nearAccountOK(intent.sender)) return { handled: true, pending: null, content: 'Select your signed-in NEAR wallet first, then ask for the transfer again.' };
  if (intent.senderRole && (!roles[intent.senderRole]?.verifiedAt || roles[intent.senderRole].account !== intent.sender)) return { handled: true, pending: null, content: 'Your verified source wallet changed. Ask for a new transfer review.' };
  if (intent.destination.ambiguous) return { handled: true, pending: intent, content: `Send ${intent.amount} native NEAR from ${intent.sender} to which wallet: your agent wallet, or another exact NEAR account? Reply “agent should receive it” or type a new complete request. No transfer review has been created yet.` };
  const role = intent.destination.role;
  const linked = role ? roles[role] : null;
  if (role && (!linked?.verifiedAt || !nearAccountOK(linked.account))) return { handled: true, pending: null, content: `Link and verify your ${role} wallet in Wallets first, then ask again. No transfer review was created.` };
  const recipient = linked?.account || intent.destination.account;
  if (!nearAccountOK(recipient) || recipient === intent.sender) return { handled: true, pending: null, content: 'The recipient must be a different exact NEAR account from your selected sender. No transfer review was created.' };
  return { handled: true, pending: null, transfer: { sender: intent.sender, ...(intent.senderRole ? { senderRole: intent.senderRole } : {}), recipient, token: 'near', amount: intent.amount, denomination: 'token', ...(role ? { recipientRole: role } : {}) } };
}

// Financial status is rendered from backend evidence, never model prose.
export function transferChatReply(text, cards = [], steps = []) {
  const card = cards.find(c => c.type === 'transfer' && c.draft?.id);
  if (card) return `Your review for ${card.draft.amount} ${card.draft.symbol} from ${card.draft.sender} to ${card.draft.recipient} is ready below. Check the details, then choose “Approve in wallet” or reply “approve” or “yes” to open your wallet. Nothing has been signed or sent.`;
  const failed = steps.find(s => s.tool === 'prepare_transfer' && s.status === 'failed');
  if (failed) return `No transfer review was created. ${failed.message || 'Preparation failed. Please try a new complete request.'} Nothing has been signed or sent.`;
  if (cards.some(c => c.type === 'workflow' && c.screen === 'Transfers')) return 'The Open Transfers button below opens the transfer form. No transfer review was created in this turn. Enter the recipient and amount there, or type a complete transfer request here.';
  if (cards.length) return text;
  if (/\b(?:prepared|created)\b.{0,35}\b(?:transfer|review|card)\b|^(?:i(?:'ve| have)?\s+)?prepared[.!✅\s]|(?:review|transfer|confirmation)\s+card.{0,35}(?:ready|showing|created)|(?:created|ready).{0,35}(?:review|transfer)\s+card/i.test(text)) return 'No new transfer review was created in this turn. Type a complete transfer request, or reopen an existing review in Transfers. Nothing has been signed or sent.';
  return text;
}
