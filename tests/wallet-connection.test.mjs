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
