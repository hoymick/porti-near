import test from 'node:test';
import assert from 'node:assert/strict';
import {assertWalletTransactionSupported,walletTransactionIssue,transferSigningError} from '../lib/wallet-transaction-support.mjs';
const okx={manifest:{id:'okx-wallet'}};
const native={actions:[{type:'Transfer',params:{deposit:'500000000000000000000000'}}]};
const call={actions:[{type:'FunctionCall',params:{methodName:'ft_transfer',deposit:'1'}}]};
test('OKX native action is blocked without changing the reviewed transaction',()=>{
 const before=JSON.stringify(native);
 assert.throws(()=>assertWalletTransactionSupported(okx,native),/cannot send native NEAR/);
 assert.equal(JSON.stringify(native),before);
 assert.ok(walletTransactionIssue(okx,{actions:[...call.actions,...native.actions]}));
 assert.ok(walletTransactionIssue(okx,{actions:[]}));
 assert.ok(walletTransactionIssue(okx,null));
});
test('contract calls and other providers retain their existing signing flow',()=>{
 assert.equal(walletTransactionIssue(okx,call),'');
 for(const wallet of [{manifest:{id:'meteor-wallet'}},{kind:'porti-local'},{}])assert.equal(walletTransactionIssue(wallet,native),'');
});
test('provider failures keep unknown outcomes and returned hashes distinct',()=>{
 assert.equal(transferSigningError(Error('preflight'),false,''),'preflight');
 assert.match(transferSigningError(Error('sign Error'),true,''),/unknown outcome/);
 assert.match(transferSigningError(Error('timeout'),true,'original-hash'),/original-hash/);
 assert.match(transferSigningError(Error('timeout'),true,'original-hash'),/do not send again/);
});
