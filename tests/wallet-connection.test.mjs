import test from 'node:test';
import assert from 'node:assert/strict';
import { restoreWalletConnection } from '../lib/wallet-connection.mjs';
import { linkLoginWallet } from '../lib/login-wallet.mjs';
import { hashToken, revokeSession } from '../lib/near-session.mjs';
import { readWorkspace, mutateWorkspace } from '../lib/store.mjs';
import { database } from './helpers/services.mjs';

test('landing-page connection restores the same signing provider without connect or sign-in', async () => {
  const wallet = { signAndSendTransaction() {} };
  let reads = 0;
  const connector = {
    async getConnectedWallet() { reads++; return { wallet, accounts: [{ accountId: 'alice.near' }] }; },
    connect() { assert.fail('restoration must not open a wallet picker'); },
  };
  assert.deepEqual(await restoreWalletConnection(connector, 'alice.near'), { wallet, account: 'alice.near' });
  assert.equal(reads, 1);
  assert.equal(await restoreWalletConnection(connector, 'bob.near'), null);
  assert.equal(await restoreWalletConnection({ async getConnectedWallet() { throw Error('locked'); } }, 'alice.near'), null);
  assert.equal(await restoreWalletConnection({ async getConnectedWallet() { return { wallet, accounts: [] }; } }, 'alice.near'), null);
});

async function session() {
  const { adapter: db } = database();
  const token = 'A'.repeat(43), cookie = 'porti_session=' + token;
  await db.prepare('INSERT INTO porti_sessions (token_hash,account_id,created_at,expires_at) VALUES (?,?,?,?)')
    .bind(await hashToken(token), 'alice.near', Date.now(), Date.now() + 60000).run();
  return { db, cookie };
}
test('verified login links only its own main wallet and preserves other workspace data', async () => {
  const { db, cookie } = await session();
  await mutateWorkspace(db, 'near:alice.near', s => { s.porti = { messages: ['keep'], walletRoles: { agent: { account: 'agent.near', verifiedAt: 1 } } }; });
  const main = await linkLoginWallet(db, cookie, 'near:alice.near', () => ({}));
  assert.equal(main.account, 'alice.near');
  assert.deepEqual(await linkLoginWallet(db, cookie, 'near:alice.near', () => ({})), main);
  const { state } = await readWorkspace(db, 'near:alice.near');
  assert.deepEqual(state.porti.messages, ['keep']);
  assert.equal(state.porti.walletRoles.agent.account, 'agent.near');
  await assert.rejects(linkLoginWallet(db, cookie, 'near:bob.near', () => ({})), { code: 'SIGN_IN_REQUIRED' });
  await assert.rejects(linkLoginWallet(db, null, 'near:alice.near', () => ({})), { code: 'SIGN_IN_REQUIRED' });
  await revokeSession(db, cookie);
  await assert.rejects(linkLoginWallet(db, cookie, 'near:alice.near', () => ({})), { code: 'SIGN_IN_REQUIRED' });
});
test('restoration never overwrites another main wallet or merges agent and main roles', async () => {
  const { db, cookie } = await session();
  await mutateWorkspace(db, 'near:alice.near', s => { s.porti = { walletRoles: { main: { account: 'other.near' } } }; });
  await assert.rejects(linkLoginWallet(db, cookie, 'near:alice.near', () => ({})), { code: 'WALLET_CONFLICT' });
  await mutateWorkspace(db, 'near:alice.near', s => { s.porti = { walletRoles: { agent: { account: 'alice.near' } } }; });
  await assert.rejects(linkLoginWallet(db, cookie, 'near:alice.near', () => ({})), { code: 'SAME_WALLET' });
});

test('all workflows reuse the landing provider; only Change opens a selector', async () => {
  const { acquireWalletConnection } = await import('../lib/wallet-connection.mjs');
  let picks = 0, proofs = 0;
  const original = { async getAccounts() { return [{ accountId: 'alice.near' }]; }, signMessage() { proofs++; } };
  const replacement = { async getAccounts() { return [{ accountId: 'bob.near' }]; } };
  const connector = {
    async getConnectedWallet() { return { wallet: original, accounts: await original.getAccounts() }; },
    async connect() { picks++; return replacement; },
  };
  for (const workflow of ['chat', 'swap', 'stake', 'buy', 'transfer', 'care', 'wallet hub']) {
    const shared = await acquireWalletConnection(connector, { current: { wallet: original, account: 'alice.near' }, expectedAccount: 'alice.near' });
    assert.equal(shared.wallet, original, workflow);
    assert.equal(shared.account, 'alice.near');
  }
  assert.equal(picks, 0);
  assert.equal(proofs, 0);
  assert.equal((await acquireWalletConnection(connector, { forceSelect: true })).account, 'bob.near');
  assert.equal(picks, 1);
});

test('reload restoration finds the signed-in account in a multi-account provider and never prompts when absent', async () => {
  const { acquireWalletConnection } = await import('../lib/wallet-connection.mjs');
  const wallet = { async getAccounts() { return [{ accountId: 'other.near' }, { accountId: 'alice.near' }]; } };
  const connector = {
    async getConnectedWallet() { return { wallet, accounts: await wallet.getAccounts() }; },
    connect() { assert.fail('reload must not open the wallet selector'); },
  };
  assert.equal((await acquireWalletConnection(connector, { expectedAccount: 'alice.near', restoreOnly: true })).account, 'alice.near');
  assert.equal(await acquireWalletConnection(connector, { expectedAccount: 'bob.near', restoreOnly: true }), null);
  assert.equal(await acquireWalletConnection(connector, { current: { wallet: { async getAccounts() { throw Error('locked'); } }, account: 'alice.near' }, expectedAccount: 'alice.near', restoreOnly: true }).then(r => r.account), 'alice.near');
});

test('Porti chat acknowledges a shared connection without generating another connect card', async () => {
  const { walletChatState, walletSetupResult } = await import('../lib/wallet-connection.mjs');
  const roles = { main: { account: 'alice.near', verifiedAt: 1 } };
  const connected = walletSetupResult('connect', 'alice.near', roles);
  assert.equal(connected.output.status, 'already_connected');
  assert.equal(connected.card, undefined);
  assert.equal(connected.output.connectedWallet, 'alice.near');
  assert.equal(connected.output.requiresTransactionApproval, true);
  assert.equal(connected.output.agent, null, 'a second agent wallet is not required');
  assert.equal(walletChatState(null, roles).status, 'disconnected', 'saved ownership is not a live signing connection');
  assert.equal(walletSetupResult('connect', null, roles).card.mode, 'connect');
  assert.equal(walletSetupResult('create', 'alice.near', roles).card.mode, 'create', 'explicit creation of a separate wallet is still available');
});

test('successful sign-in persists its main wallet before the first workspace request', async () => {
  const { load } = await import('./helpers/services.mjs');
  const { sessionCookie } = await import('../lib/near-session.mjs');
  const { DomainError } = await import('../lib/errors.mjs');
  const { db } = await session();
  let checks = 0;
  const { POST } = load('app/api/auth/route.ts', {
    env: { DB: db }, DomainError, linkLoginWallet, sessionCookie,
    initialPorti: () => ({ walletRoles: {}, messages: [] }),
    sameOrigin: () => {}, readJSON: r => r.json(),
    completeLogin: async () => { checks++; return { accountId: 'alice.near', token: 'A'.repeat(43) }; },
    errorResponse: e => Response.json({ error: { code: e.code } }, { status: e.status || 500 }),
  }, ['POST']);
  const r = await POST(new Request('https://porti.example/api/auth', { method: 'POST', body: JSON.stringify({ action: 'verify', challengeId: 'verified-challenge', proof: {} }) }));
  assert.equal(r.status, 200);
  assert.equal(checks, 1);
  assert.equal((await r.json()).account, 'alice.near');
  assert.match(r.headers.get('Set-Cookie'), /HttpOnly/);
  const { state } = await readWorkspace(db, 'near:alice.near');
  assert.equal(state.porti.walletRoles.main.account, 'alice.near');
  assert.ok(state.porti.walletRoles.main.verifiedAt);
});
