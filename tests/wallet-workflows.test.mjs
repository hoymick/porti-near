import {swapProgress} from '../lib/transaction-progress.mjs';
import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import ts from 'typescript';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { swapChains } from '../lib/swap-chains.mjs';
import { decimal } from '../lib/near-core.mjs';
import { acquireWalletConnection, walletChatState, walletSetupResult } from '../lib/wallet-connection.mjs';

const hookCode=ts.transpileModule(fs.readFileSync('app/use-chat-confirmation.ts','utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText.replace(/^import[\s\S]*?;\s*$/gm,'').replace('export default function','function');
const useChatConfirmation=new Function('useRef','useEffect',hookCode+';return useChatConfirmation;')(React.useRef,React.useEffect);

const monitorCode=ts.transpileModule(fs.readFileSync('app/use-transaction-monitor.ts','utf8'),{compilerOptions:{target:ts.ScriptTarget.ES2022,module:ts.ModuleKind.ESNext}}).outputText.replace(/^import[\s\S]*?;\s*$/gm,'').replace('export default function','function');
const useTransactionMonitor=new Function('useRef','useEffect',monitorCode+';return useTransactionMonitor;')(React.useRef,React.useEffect);

function component(file, name) {
  const code = ts.transpileModule(fs.readFileSync(file, 'utf8'), {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext, jsx: ts.JsxEmit.React },
  }).outputText.replace(/^import[\s\S]*?;\s*$/gm, '').replace('export default function', 'function');
  return new Function('React', 'useState', 'useEffect', 'useRef', 'useId', 'swapChains', 'decimal', 'useChatConfirmation', 'useTransactionMonitor', 'swapProgress', code + '\nreturn ' + name)(React, React.useState, React.useEffect, React.useRef, React.useId, swapChains, decimal, useChatConfirmation, useTransactionMonitor, swapProgress);
}

test('a signed-in wallet remains selected in swap and staking views while the signer is unavailable', () => {
  const props = { account: 'alice.near', wallet: null, sample: false,
    onConnect: () => assert.fail('opening a feature must not reconnect'),
    requireWallet: () => assert.fail('rendering and preparing reviews must not acquire a signer'),
  };
  const swap = renderToStaticMarkup(React.createElement(component('app/swaps.tsx', 'Swaps'), props));
  const stake = renderToStaticMarkup(React.createElement(component('app/staking.tsx', 'Staking'), props));
  for (const html of [swap, stake]) {
    assert.match(html, /alice\.near/);
    assert.doesNotMatch(html, /Connect and verify/);
    assert.match(html, /provider opens when you approve/);
  }
  assert.match(stake, /<button class="primary">Prepare staking review<\/button>/, 'preparing a review needs the verified account, not an unlocked provider');
});

test('chat preserves the selected account without pretending it has a live signer', () => {
  const roles = { main: { account: 'alice.near', verifiedAt: 1 } };
  const state = walletChatState('alice.near', roles, false);
  assert.equal(state.selectedWallet, 'alice.near');
  assert.equal(state.connectedWallet, null);
  assert.equal(state.signingAvailable, false);
  const setup = walletSetupResult('connect', 'alice.near', roles, false);
  assert.equal(setup.output.status, 'already_selected');
  assert.equal(setup.card, undefined, 'no duplicate sign-in or ownership card');
});

test('approval recovers the actual matching provider and refuses a different account', async () => {
  let selections = 0;
  const signer = { async getAccounts() { return [{ accountId: 'alice.near' }]; } };
  const connector = { async getConnectedWallet() { throw Error('provider locked'); }, async connect() { selections++; return signer; } };
  assert.equal(await acquireWalletConnection(connector, { expectedAccount: 'alice.near', restoreOnly: true }), null);
  assert.equal(selections, 0, 'restoration does not request access');
  const actual = await acquireWalletConnection(connector, { expectedAccount: 'alice.near' });
  assert.equal(actual.wallet, signer);
  assert.equal(selections, 1, 'explicit approval may open the provider');
  await assert.rejects(acquireWalletConnection(connector, { expectedAccount: 'bob.near' }), /reviewed NEAR account/);
});

test('an exact chat staking review shows one approval without a second amount form',()=>{
 const html=renderToStaticMarkup(React.createElement(component('app/staking.tsx','Staking'),{account:'agent.near',wallet:null,sample:false,compact:true,active:true,initialDraft:{id:'review',sender:'agent.near',amount:'1',status:'review',estimatedStNear:'0.6',reserve:'10000000000000000000000',expiresAt:Date.now()+60000},onConnect:()=>assert.fail(),requireWallet:()=>assert.fail('render cannot sign')}));
 assert.match(html,/Approve staking in wallet/);
 assert.doesNotMatch(html,/Prepare staking review/);
 assert.doesNotMatch(html,/Stake amount in NEAR/);
 assert.match(html,/meta-pool.near/);
});
