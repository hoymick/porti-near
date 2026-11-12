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
