import test from 'node:test';
import assert from 'node:assert/strict';
import { load } from './helpers/services.mjs';
import { DomainError } from '../lib/errors.mjs';

function fixture(busy=false){
 const state={porti:{messages:[{role:'user',content:'send 0.1 NEAR'}],pendingChatTransfer:{sender:'alice.near'},walletRoles:{main:{account:'alice.near'}},drafts:[{id:'review'}],receipts:[{id:'receipt'}],...(busy?{chatLock:{id:'running',at:Date.now()}}:{})}};
 const api=load('app/api/porti/route.ts',{
  DomainError,owner:async()=>'owner',sameOrigin:()=>{},limit:async()=>{},readJSON:r=>r.json(),
  mutate:async(id,fn)=>fn(state),readWorkspace:async()=>({state}),safePorti:s=>s.porti,myProfile:async()=>null,
  errorResponse:e=>Response.json({error:{code:e.code}},{status:e.code==='CHAT_BUSY'?409:500}),
 },['POST']);
 return {...api,state};
}
const request=()=>new Request('https://porti.example/api/porti',{method:'POST',body:JSON.stringify({action:'clear-chat'})});
test('clear chat removes messages and pending intent while retaining wallets, reviews and receipts',async()=>{
 const f=fixture(),before=structuredClone(f.state.porti),response=await f.POST(request());
 assert.equal(response.status,200);
 const {porti}=await response.json();assert.deepEqual(porti.messages,[]);
 assert.equal(porti.pendingChatTransfer,undefined);
 for(const key of ['walletRoles','drafts','receipts'])assert.deepEqual(porti[key],before[key]);
});
test('clear chat refuses to erase messages or intent during an active turn',async()=>{
 const f=fixture(true),before=structuredClone(f.state);
 assert.equal((await f.POST(request())).status,409);
 assert.deepEqual(f.state,before);
});
