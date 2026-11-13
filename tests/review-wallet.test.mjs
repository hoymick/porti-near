import test from 'node:test';
import assert from 'node:assert/strict';
import { acquireReviewedWallet, assertTransferSourceRole, reviewSenderAllowed } from '../lib/review-wallet.mjs';
import { latestChatTransfer } from '../lib/chat-transfer-approval.mjs';

const roles={main:{account:'alice.near',verifiedAt:1},agent:{account:'agent.near',verifiedAt:1}};
const draft={id:'return-review',sender:'agent.near',senderRole:'agent',recipient:'alice.near',token:'near',amount:'0.1',symbol:'NEAR',expiresAt:2000,status:'awaiting_review'};
const reply={role:'assistant',cards:[{type:'transfer',draft}]};
const adapter=(account)=>({getAccounts:async()=>[{accountId:account}],signAndSendTransaction(){assert.fail('selecting a signer must never sign or submit');}});
test('only a verified, unchanged source role permits a different selected account',()=>{
 assert.equal(reviewSenderAllowed(draft,'alice.near',roles),true);
 assert.equal(latestChatTransfer([reply],[draft],'alice.near',1000,roles),draft);
 for(const changed of [{},{...roles,agent:{account:'other.near',verifiedAt:1}},{...roles,agent:{account:'agent.near'}}]){
  assert.throws(()=>assertTransferSourceRole(changed,'agent','agent.near'),{code:'SOURCE_WALLET_CHANGED'});
  assert.equal(latestChatTransfer([reply],[draft],'alice.near',1000,changed),null);
 }
 assert.equal(reviewSenderAllowed({...draft,senderRole:undefined},'alice.near',roles),false);
 assert.equal(reviewSenderAllowed({...draft,senderRole:'other'},'alice.near',roles),false);
 assert.equal(latestChatTransfer([reply],[{...draft,senderRole:'main'}],'alice.near',1000,roles),null);
 assert.equal(latestChatTransfer([reply],[{...draft,status:'wallet_requested'}],'alice.near',1000,roles),null);
 assert.equal(latestChatTransfer([reply],[draft],'alice.near',2000,roles),null);
});
test('approval reuses the matching unlocked internal adapter while main stays connected',async()=>{
 const agent=adapter('agent.near');
 const actual=await acquireReviewedWallet({expectedAccount:'agent.near',candidates:[adapter('alice.near'),agent],localAccount(){assert.fail('no storage access needed')},openLocal(){assert.fail('no unlock needed')},acquireExternal(){assert.fail('no external picker needed')}});
 assert.equal(actual,agent);
});
test('locked device wallets open their own unlock panel without connecting or signing',async()=>{
 let opens=0;
 const args={expectedAccount:'agent.near',candidates:[adapter('alice.near'),{getAccounts:async()=>{throw Error('locked')}}],localAccount:async()=>'agent.near',openLocal:()=>{opens++},acquireExternal(){assert.fail('a device wallet must not open an external wallet picker')}};
 await assert.rejects(acquireReviewedWallet(args),/approve again/);
 assert.equal(opens,1);
 // Unlocking merely makes a provider available. A fresh approval is needed to
 // acquire it, and even that acquisition must not sign a transaction.
 const unlocked=adapter('agent.near');
 assert.equal(await acquireReviewedWallet({...args,candidates:[unlocked]}),unlocked);
 assert.equal(opens,1);
});
test('external recovery cannot substitute an account and local lookup failures fail closed',async()=>{
 const args={expectedAccount:'agent.near',localAccount:async()=>null,openLocal(){assert.fail('not a device wallet')},acquireExternal:async()=>adapter('alice.near')};
 await assert.rejects(acquireReviewedWallet(args),/exact sender/);
 await assert.rejects(acquireReviewedWallet({...args,localAccount:async()=>{throw Error('storage failed')},acquireExternal(){assert.fail('do not fall through on failed storage')}}),/storage failed/);
});
