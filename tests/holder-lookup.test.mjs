import test from 'node:test';
import assert from 'node:assert/strict';
import {parseHolders} from '../lib/near-core.mjs';
import {createHolderLookup} from '../lib/holder-lookup.mjs';

const payload = {data: [{account: 'intents.near', amount: '17069442252537853514290912912539'}], meta: {next_page: 'cursor'}};

test('v3 holder addresses and raw balances survive parsing exactly', () => {
  assert.deepEqual(parseHolders(payload), [{address: {hash: 'intents.near', is_contract: null}, value: '17069442252537853514290912912539'}]);
  assert.equal(parseHolders({holders: [{account_id: 'alice.near', balance: '7'}]})[0].value, '7');
  assert.equal(parseHolders({data: [...payload.data, ...payload.data]}).length, 1);
  assert.deepEqual(parseHolders({data: []}), []);
  assert.throws(() => parseHolders({data: [null, {account: 'alice.near', amount: 123}]}));
  assert.throws(() => parseHolders({data: {holders: []}}));
});

test('concurrent requests share work and cached candidates cannot be mutated by RPC enrichment', async () => {
  let clock = 0, calls = 0, release;
  const lookup = createHolderLookup(() => clock);
  const fetcher = async () => { calls++; await new Promise(resolve => {release = resolve}); return payload; };
  const first = lookup('workspace-a', 'wrap.near', fetcher);
  const second = lookup('workspace-a', 'wrap.near', fetcher);
  release();
  const [a, b] = await Promise.all([first, second]);
  assert.equal(calls, 1);
  a.holders[0].value = '99';
  a.holders[0].address.hash = 'changed.near';
  assert.equal(b.holders[0].value, payload.data[0].amount);
  assert.equal((await lookup('workspace-a', 'wrap.near', fetcher)).holders[0].address.hash, 'intents.near');
  clock = 45000;
  await lookup('workspace-a', 'wrap.near', async () => {calls++; return payload});
  assert.equal(calls, 2);
});

test('rate limits cool down a workspace and recover without caching failures or leaking across workspaces', async () => {
  let clock = 0, calls = 0;
  const lookup = createHolderLookup(() => clock);
  const limited = async () => {calls++; throw Object.assign(new Error('rate limited'), {code: 'PROVIDER_RATE_LIMIT'});};
  await assert.rejects(lookup('a', 'wrap.near', limited));
  await assert.rejects(lookup('a', 'other.near', limited), /one minute/);
  assert.equal(calls, 1);
  assert.equal((await lookup('b', 'wrap.near', async () => payload)).holders.length, 1);
  clock = 60000;
  assert.equal((await lookup('a', 'wrap.near', async () => payload)).holders.length, 1);
});

test('malformed provider data is not cached as an empty holder list', async () => {
  const lookup = createHolderLookup();
  await assert.rejects(lookup('a', 'wrap.near', async () => ({error: 'unavailable'})));
  assert.equal((await lookup('a', 'wrap.near', async () => payload)).holders.length, 1);
});
