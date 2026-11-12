import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {stripTypeScriptTypes} from 'node:module';
import {latestChatTransfer} from '../lib/chat-transfer-approval.mjs';
const source=fs.readFileSync('app/near-workspace.tsx','utf8');
const start=source.indexOf('  async function signTransfer(');
const code=stripTypeScriptTypes(source.slice(start,source.indexOf('  useEffect(() => {',start)));
function harness({account='alice.near',reject=false}={}) {
 const draft={id:'one',sender:'alice.near',recipient:'agent.near',token:'near',amount:'0.5',symbol:'NEAR',status:'awaiting_review',expiresAt:Date.now()+60000};
 const p={messages:[{role:'assistant',cards:[{type:'transfer',draft:{...draft}}]}],drafts:[draft]};
 const calls=[],errors=[],modals=[];
 const deps={draft,reviewed:false,sample:false,walletAccount:'alice.near',guard:{current:false},p,latestChatTransfer,
  setBusy:()=>{},setError:e=>errors.push(e),setMessage:()=>{},setDraft:d=>modals.push(d),setReceiptHash:()=>{},
  requireSigningWallet:async()=>({getAccounts:async()=>[{accountId:account}],signAndSendTransaction:async()=>{calls.push('wallet');if(reject)throw Error('User cancelled');return {transaction:{hash:'hash'}}}}),
  request:async input=>{calls.push(input.action);if(input.action==='validate-draft')return {draft:{...draft,status:'wallet_requested',transaction:{receiverId:draft.recipient}}};return {}},
  accept:r=>{if(r.draft)p.drafts=[r.draft]},sessionStorage:{setItem:()=>{},removeItem:()=>{}},browserRequestId:()=> 'new',transferRequest:{current:null}};
 const sign=new Function(...Object.keys(deps),code+';return signTransfer;')(...Object.values(deps));
 return {sign,draft,p,calls,errors,modals};
}
test('chat confirmation validates before the mocked wallet and never opens another review modal',async()=>{
 const h=harness();assert.equal(await h.sign(h.draft,true),true);
 assert.deepEqual(h.calls,['validate-draft','wallet','save-transfer-hash','record-transfer']);
 assert.deepEqual(h.modals,[]);
 assert.equal(await h.sign(h.draft,true),false);
 assert.equal(h.calls.filter(c=>c==='wallet').length,1);
});
test('wrong signer and cancelled wallet cannot report a completed transfer',async()=>{
 const wrong=harness({account:'other.near'});assert.equal(await wrong.sign(wrong.draft,true),false);assert.deepEqual(wrong.calls,[]);
 const cancel=harness({reject:true});assert.equal(await cancel.sign(cancel.draft,true),false);assert.deepEqual(cancel.calls,['validate-draft','wallet']);
 assert.equal(await cancel.sign(cancel.draft,true),false);
 assert.ok(cancel.errors.includes('User cancelled'));
});
