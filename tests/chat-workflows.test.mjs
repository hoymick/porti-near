import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {stripTypeScriptTypes} from 'node:module';
import {chatWorkflows,isChatCancellation} from '../lib/chat-workflows.mjs';
function action(file,name,deps){const line=fs.readFileSync(file,'utf8').split('\n').find(l=>l.includes('async function '+name+'('));return new Function(...Object.keys(deps),stripTypeScriptTypes(line)+';return '+name)(...Object.values(deps));}
test('all feature routes are shared with chat and cancellation is explicit',()=>{
 assert.equal(chatWorkflows.length,19);assert.equal(new Set(chatWorkflows).size,19);
 for(const text of ['no','cancel','No thanks!','cancel review'])assert.ok(isChatCancellation(text));
 for(const text of ['no send 5','cancelled earlier','yes'])assert.ok(!isChatCancellation(text));
});
test('swap confirmations respect exact stage, expiry, sender and live mode',async()=>{
 for(const state of [{status:'preview'},{status:'wallet_requested'},{status:'preview',expiresAt:1},{status:'preview',sender:'other.near'},{status:'preview',sample:true}]){
  const calls=[],order={id:'q',sender:'alice.near',expiresAt:Date.now()+60000,...state};
  const deps={busy:false,sample:!!state.sample,order,account:'alice.near',run:async fn=>fn(),api:async d=>{calls.push(d.action);return {order:{...order,status:'wallet_requested'}}},setOrder:()=>{},setReview:()=>{}};
  await action('app/swaps.tsx','approveQuote',deps)();
  assert.deepEqual(calls,state.status==='preview'&&order.expiresAt> Date.now()&&order.sender==='alice.near'&&!state.sample?['approve']:[]);
 }
});
test('staking only opens the mocked wallet after review validation and blocks inactive reviews',async()=>{
 for(const status of ['review','wallet_requested','finalized']){
  const calls=[],draft={id:'s',sender:'alice.near',status,expiresAt:Date.now()+60000};
  const deps={active:true,busy:false,sample:false,draft,account:'alice.near',run:async fn=>fn(),requireWallet:async()=>({getAccounts:async()=>[{accountId:'alice.near'}],signAndSendTransaction:async()=>{calls.push('wallet');return {transaction:{hash:'h'}}}}),api:async d=>{calls.push(d.action);return {draft:{...draft,transaction:{receiverId:'meta-pool.near'}}}},setDraft:()=>{},sessionStorage:{setItem:()=>{},removeItem:()=>{}},setHash:()=>{},verify:async()=>calls.push('verify')};
  await action('app/staking.tsx','approveStake',deps)();assert.deepEqual(calls,status==='review'?['approve','wallet','verify']:[]);
 }
});

 test('replaced confirmation cannot execute a newer review and cleanup preserves a replacement',async()=>{
  const source=stripTypeScriptTypes(fs.readFileSync('app/use-chat-confirmation.ts','utf8')).replace(/^import[\s\S]*?;\s*$/gm,'').replace('export default function','function');
  const ref={current:null},cleanups=[];let registered;const calls=[];
  const hook=new Function('useRef','useEffect',source+';return useChatConfirmation;')(value=>{if(!ref.current)ref.current=value;return ref},fn=>cleanups.push(fn()));
  const register=(value,previous)=>{if(value)registered=value;else if(registered===previous)registered=null};
  hook(register,'review-one',async()=>calls.push('one'));const old=registered;
  hook(register,'review-two',async()=>calls.push('two'));const current=registered;
  await old.approve();assert.deepEqual(calls,[]);cleanups[0]();assert.equal(registered,current);
  await current.approve();assert.deepEqual(calls,['two']);cleanups[1]();assert.equal(registered,null);
 });

test('historical staking cards cannot request another wallet signature',async()=>{
 const deps={active:false,busy:false,sample:false,draft:{status:'review'},requireWallet:()=>assert.fail('inactive card must not open wallet')};
 await action('app/staking.tsx','approveStake',deps)();
});
