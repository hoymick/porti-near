import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {stripTypeScriptTypes} from 'node:module';
import {swapChatIntent} from '../lib/swap-chat-intent.mjs';
import {tokenRegistered,registrationEvidence} from '../lib/swap-registration.mjs';
import {DomainError} from '../lib/errors.mjs';
import {nearAccountOK,nearHashOK,units,decimal} from '../lib/near-core.mjs';
function load(file,deps,names){const code=stripTypeScriptTypes(fs.readFileSync(file,'utf8')).replace(/^import[\s\S]*?;\s*$/gm,'').replace(/^export /gm,'');return new Function(...Object.keys(deps),code+';return {'+names.join(',')+'};')(...Object.values(deps));}
const contract='hoot-8ecf65.launchpad.justhoot.near',sender='agent.near',hash='1'.repeat(44);
const roles={agent:{account:sender,verifiedAt:1},main:{account:'main.near',verifiedAt:1}};
function service(){
 const state={porti:{walletRoles:roles,messages:[],swapRegistrations:[],swapOrders:[]}};
 let registered=false,txStatus='pending';
 const tokens=[{contract:'wrap.near',assetId:'nep141:wrap.near',decimals:24,blockchain:'near',symbol:'wNEAR'},{contract,assetId:'nep141:'+contract,decimals:18,blockchain:'near',symbol:'HOOT'}];
 const api=load('lib/swaps.ts',{env:{},DomainError,nearAccountOK,nearHashOK,units,decimal,tokenRegistered,registrationEvidence,
  catalogTokens:x=>x,swapRecipientOK:()=>true,outputTransactionURL:()=>null,
  readWorkspace:async()=>({state}),initialPorti:()=>state.porti,mutate:async(id,fn)=>({result:await fn(state)}),
  fetch:async()=>Response.json(tokens),responseJSON:r=>r.json(),
  viewAccount:async()=>({amount:'10000000000000000000000000',storage_usage:0}),
  viewFunction:async(id,c,method)=>method==='ft_metadata'?{decimals:18}:method==='storage_balance_bounds'?{min:'1250000000000000000000'}:registered?{total:'1250000000000000000000',available:'0'}:null,
  nearRpc:async(id,method)=>method==='gas_price'?{gas_price:'100000000'}:txStatus==='pending'?{final_execution_status:'EXECUTED_OPTIMISTIC'}:evidence(state.porti.swapRegistrations[0],txStatus),
 },['swapAction','swapState']);
 return {state,...api,setRegistered:v=>registered=v,setTx:v=>txStatus=v};
}
function evidence(r,status='success'){return {final_execution_status:'FINAL',transaction:{hash,signer_id:status==='mismatch'?'other.near':r.sender,receiver_id:r.contract,actions:[{FunctionCall:{method_name:'storage_deposit',deposit:r.storageRaw,gas:30000000000000,args:btoa(JSON.stringify({account_id:r.sender,registration_only:true}))}}]},status:status==='failed'?{Failure:{ActionError:'failed'}}:{SuccessValue:''},receipts_outcome:[]};}
test('exact chat buy resolves the verified agent source without a separate form',()=>{
 assert.deepEqual(swapChatIntent('in my agent wallet buy 0.1 near of this '+contract,{wallet:'main.near',roles}),{sender,contract,amount:'0.1',slippage:50});
 assert.equal(swapChatIntent('swap 0.1 NEAR for '+contract+' from my agent wallet',{roles}).sender,sender);
 for(const message of ['yes','do not buy 0.1 near of '+contract,'buy some HOOT'])assert.equal(swapChatIntent(message,{wallet:sender,roles}),null);
 assert.equal(swapChatIntent('buy 0.1 near of '+contract,{wallet:sender,imageId:'image'}),null);
 assert.ok(swapChatIntent('in my agent wallet buy 0.1 near of '+contract,{roles:{}}).error);
});
test('registration balance handles zero-cost tokens and rejects malformed responses',()=>{
 assert.equal(tokenRegistered({total:'0',available:'0'}),true);
 for(const value of [null,{},true,{total:'1',available:'2'},{total:1,available:'0'}])assert.equal(tokenRegistered(value),false);
});
test('pending registration is reused and cannot request another signature',async()=>{
 const s=service(),first=await s.swapAction('owner',{action:'register',sender,destination:'nep141:'+contract});
 const id=first.registration.id;
 await s.swapAction('owner',{action:'request-registration',registrationId:id});
 await assert.rejects(s.swapAction('owner',{action:'request-registration',registrationId:id}),{code:'SWAP_REGISTRATION_PENDING'});
 const pending=await s.swapAction('owner',{action:'verify-registration',registrationId:id,hash});assert.equal(pending.registered,false);
 const repeat=await s.swapAction('owner',{action:'register',sender,destination:'nep141:'+contract});assert.equal(repeat.registration.id,id);assert.equal(s.state.porti.swapRegistrations.length,1);
});
test('registration only completes after matching final execution and final storage read',async()=>{
 const s=service(),r=(await s.swapAction('owner',{action:'register',sender,destination:'nep141:'+contract})).registration;
 await s.swapAction('owner',{action:'request-registration',registrationId:r.id});s.setTx('success');
 assert.equal((await s.swapAction('owner',{action:'verify-registration',registrationId:r.id,hash})).registered,false);
 s.setRegistered(true);
 assert.equal((await s.swapAction('owner',{action:'verify-registration',registrationId:r.id,hash})).registered,true);
 assert.equal((await s.swapAction('owner',{action:'register',sender,destination:'nep141:'+contract})).registered,true);
});
test('failed or unrelated transactions never complete registration',async()=>{
 for(const status of ['failed','mismatch']){
  const s=service(),r=(await s.swapAction('owner',{action:'register',sender,destination:'nep141:'+contract})).registration;
  await s.swapAction('owner',{action:'request-registration',registrationId:r.id});s.setRegistered(true);s.setTx(status);
  await assert.rejects(s.swapAction('owner',{action:'verify-registration',registrationId:r.id,hash}),{code:status==='failed'?'SWAP_REGISTRATION_FAILED':'SWAP_REGISTRATION_MISMATCH'});
  assert.notEqual(s.state.porti.swapRegistrations[0].status,'confirmed');
 }
});
test('chat quote preparation returns registration or an executable review without funding',async()=>{
 const calls=[],token={contract,blockchain:'near',assetId:'nep141:'+contract};let registered=false;
 const api=load('lib/swap-chat.ts',{swapTokens:async()=>[token],DomainError,swapAction:async(id,i)=>{calls.push(i.action);return i.action==='register'?{registered,registration:{id:'registration'}}:i.action==='preview'?{order:{id:'preview'}}:{order:{id:'ready',status:'wallet_requested'}}}},['prepareChatSwap']);
 const request={sender,contract,amount:'0.1',slippage:50};assert.ok((await api.prepareChatSwap('owner',request)).registration);assert.deepEqual(calls,['register']);
 registered=true;calls.length=0;assert.equal((await api.prepareChatSwap('owner',request)).order.id,'ready');assert.deepEqual(calls,['register','preview','approve']);assert.ok(!calls.includes('fund'));
 await assert.rejects(api.prepareChatSwap('owner',{...request,contract:'other.near'}),{code:'SWAP_TOKEN_UNAVAILABLE'});
});
