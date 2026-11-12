import test from 'node:test';
import assert from 'node:assert/strict';
import { transferChatIntent, transferChatReply } from '../lib/transfer-chat.mjs';
import { load } from './helpers/services.mjs';
import { DomainError } from '../lib/errors.mjs';
const roles = { main: { account:'alice.near',verifiedAt:1 }, agent:{account:'agent.near',verifiedAt:1} };
const ctx = {wallet:'alice.near',roles,now:1000};

test('typed amount survives the exact agent clarification that previously failed',()=>{
 const first=transferChatIntent('good send 0.5 near to my porti wallet',null,ctx);
 assert.ok(first.pending); assert.equal(first.transfer,undefined);
 const next=transferChatIntent('agent should recieve it',first.pending,ctx);
 assert.deepEqual(next.transfer,{sender:'alice.near',recipient:'agent.near',token:'near',amount:'0.5',denomination:'token',recipientRole:'agent'});
 assert.equal(next.pending,null);
 assert.equal(transferChatIntent('yes',null,ctx).handled,false,'yes cannot manufacture a transfer');
 assert.ok(transferChatIntent('yes',first.pending,ctx).pending,'yes does not invent an ambiguous destination');
});
test('direct agent and explicit-account native requests resolve without retyping a wallet address',()=>{
 assert.equal(transferChatIntent('Send 0.5 NEAR to my agent wallet',null,ctx).transfer.recipient,'agent.near');
 assert.equal(transferChatIntent('transfer 1 NEAR to bob.near',null,ctx).transfer.recipient,'bob.near');
 assert.equal(transferChatIntent('send 1 NEAR to my main wallet',null,ctx).transfer,undefined,'self transfer rejected');
 assert.equal(transferChatIntent('send 1 NEAR to my agent wallet',null,{...ctx,roles:{}}).transfer,undefined,'unverified role rejected');
});
test('cancellation, expiry, changed sender, images and unrelated topics cannot reuse an intent',()=>{
 const first=transferChatIntent('send 0.5 NEAR to my Porti wallet',null,ctx);
 for(const opts of [{...ctx,now:400000},{...ctx,wallet:'bob.near'},{...ctx,imageId:'picture'}])assert.equal(transferChatIntent('agent should receive it',first.pending,opts).transfer,undefined);
 assert.equal(transferChatIntent('cancel',first.pending,ctx).pending,null);
 assert.equal(transferChatIntent('do not send 0.5 NEAR to agent.near',first.pending,ctx).transfer,undefined);
 assert.equal(transferChatIntent('what is the price of NEAR',first.pending,ctx).pending,null);
});
test('only a real backend draft can produce ready-review copy',()=>{
 const failed=transferChatReply('Prepared. ✅',[],[{tool:'prepare_transfer',status:'failed',message:'Insufficient available NEAR.'}]);
 assert.match(failed,/No transfer review was created/); assert.match(failed,/Insufficient/);
 assert.match(transferChatReply('Prepared. ✅'),/No new transfer review/);
 assert.match(transferChatReply('Prepared. No funds have been sent.'),/No new transfer review/);
 assert.match(transferChatReply('I already prepared the transfer for you.'),/No new transfer review/);
 assert.match(transferChatReply('The card is showing', [{type:'workflow',screen:'Transfers'}]),/opens the transfer form/);
 const draft={id:'draft-1',amount:'0.5',symbol:'NEAR',sender:'alice.near',recipient:'agent.near'};
 assert.match(transferChatReply('Sent!', [{type:'transfer',draft}]),/Nothing has been signed or sent/);
 assert.equal(transferChatReply('Your wallet setup card is ready',[{type:'wallet-setup'}]),'Your wallet setup card is ready');
});

function service({fail=false}={}) {
 let calls=0;
 const state={porti:{messages:[],walletRoles:structuredClone(roles),drafts:[]}};
 const api=load('lib/near-agent.ts',{
  DomainError,transferChatIntent,transferChatReply,
  createRheaPriceLookup:()=>()=>{},
  initialPorti:()=>({messages:[],walletRoles:roles}),
  mutate:async(id,fn)=>({result:await fn(state)}),
  portiConfig:async()=>({p:state.porti}),
  prepareNearTransfer:async(id,input)=>{calls++;if(fail)throw new DomainError('INSUFFICIENT_NEAR','Insufficient available NEAR.');const d={...input,id:'draft-1',symbol:'NEAR'};state.porti.drafts.push(d);return d;},
 },['nearChat']);
 return {state,...api,calls:()=>calls};
}
test('full chat clarification returns a real review, saves it and replays idempotently without invoking AI',async()=>{
 const s=service();
 const first=await s.nearChat('owner',{message:'good send 0.5 near to my porti wallet',wallet:'alice.near',requestId:'request-start-123'});
 assert.equal(first.cards.length,0);
 const input={message:'agent should recieve it',wallet:'alice.near',requestId:'request-confirm-123'};
 const next=await s.nearChat('owner',input);
 assert.equal(next.cards[0].draft.amount,'0.5');
 assert.equal(next.cards[0].draft.recipient,'agent.near');
 assert.equal(next.cards[0].draft.agentDeposit,true);
 assert.equal(s.state.porti.pendingChatTransfer,null);
 await s.nearChat('owner',input);
 assert.equal(s.calls(),1);
 assert.equal(s.state.porti.chatLock,undefined);
});
test('preparation failure creates no card and reports the real error without claiming success',async()=>{
 const s=service({fail:true});
 const r=await s.nearChat('owner',{message:'Send 0.5 NEAR to my agent wallet',wallet:'alice.near',requestId:'request-failure-123'});
 assert.equal(r.cards.length,0);assert.equal(s.state.porti.drafts.length,0);
 assert.match(r.reply.content,/No transfer review was created.*Insufficient/);
 assert.equal(r.reply.steps[0].status,'failed');
 assert.equal(s.state.porti.chatLock,undefined);
});

test('explicit main-to-agent wording resolves verified roles and rejects a mismatched source',()=>{
 const text='send 0.5 near from main wallet to agent wallet';
 const result=transferChatIntent(text,null,ctx);
 assert.equal(result.transfer.sender,'alice.near');
 assert.equal(result.transfer.recipient,'agent.near');
 assert.equal(result.transfer.amount,'0.5');
 assert.equal(transferChatIntent(text,null,{...ctx,wallet:'other.near'}).transfer,undefined);
 assert.equal(transferChatIntent(text,null,{...ctx,roles:{agent:roles.agent}}).transfer,undefined);
 assert.equal(transferChatIntent(text,null,{...ctx,imageId:'image'}).transfer,undefined);
 assert.equal(transferChatIntent('do not '+text,null,ctx).transfer,undefined);
 assert.equal(transferChatIntent('send 0.5 NEAR from alice.near to bob.near',null,ctx).transfer.recipient,'bob.near');
});
test('main-to-agent sentence produces a review directly without calling the model',async()=>{
 const s=service();
 const result=await s.nearChat('owner',{message:'send 0.5 near from main wallet to agent wallet',wallet:'alice.near',requestId:'request-main-agent-123'});
 assert.equal(result.cards[0].draft.recipient,'agent.near');
 assert.equal(result.cards[0].draft.amount,'0.5');
 assert.equal(s.calls(),1);
});

const returnRequest='porti send 0.1 near back to my main wallet from my agent wallet';
test('the reported return-transfer wording and both source orders resolve without AI',()=>{
 const source={...ctx,wallet:'agent.near'};
 for(const message of [returnRequest,returnRequest.replace(' from ', '\nfrom '),'Porti, send 0.1 NEAR to my main wallet from my agent wallet.','please transfer 0.1 native NEAR from my agent wallet back to my main wallet','send 0.1 near from agent.near to alice.near','send 0.1 near to alice.near from agent.near']){
  const result=transferChatIntent(message,null,source);
  assert.equal(result.handled,true,message);
  assert.equal(result.transfer.sender,'agent.near');
  assert.equal(result.transfer.recipient,'alice.near');
  assert.equal(result.transfer.amount,'0.1');
 }
});
test('return requests with wrong or unverified sources give direct guidance, never fall through to AI',()=>{
 for(const options of [ctx,{...ctx,wallet:'agent.near',roles:{main:roles.main}},{...ctx,wallet:'agent.near',roles:{...roles,agent:{account:'agent.near'}}}]){
  const result=transferChatIntent(returnRequest,null,options);
  assert.equal(result.handled,true);assert.equal(result.transfer,undefined);assert.equal(result.pending,null);
  assert.match(result.content,/your agent wallet/);
 }
 for(const message of ['do not '+returnRequest,returnRequest+' and send 1 NEAR to bob.near',returnRequest+' from bob.near',returnRequest+' tomorrow','send 0.1 near to unknown wallet']){
  assert.equal(transferChatIntent(message,null,{...ctx,wallet:'agent.near'}).transfer,undefined,message);
 }
 assert.equal(transferChatIntent(returnRequest,null,{...ctx,wallet:'agent.near',imageId:'image'}).transfer,undefined);
});
test('reported sentence prepares one real return review without the AI key or a model call',async()=>{
 const s=service(),input={message:returnRequest,wallet:'agent.near',requestId:'request-agent-return-123'};
 const result=await s.nearChat('owner',input);
 assert.equal(result.cards[0].draft.sender,'agent.near');
 assert.equal(result.cards[0].draft.recipient,'alice.near');
 assert.equal(result.cards[0].draft.amount,'0.1');
 assert.equal(result.cards[0].draft.agentDeposit,false);
 assert.match(result.reply.content,/Nothing has been signed or sent/);
 await s.nearChat('owner',input);assert.equal(s.calls(),1);
 assert.equal(s.state.porti.chatLock,undefined);
});
test('reported sentence with main selected never invokes AI or creates a draft',async()=>{
 const s=service();
 const result=await s.nearChat('owner',{message:returnRequest,wallet:'alice.near',requestId:'request-agent-select-123'});
 assert.match(result.reply.content,/your agent wallet/);
 assert.equal(result.cards.length,0);assert.equal(s.calls(),0);
 assert.equal(s.state.porti.chatLock,undefined);
});
