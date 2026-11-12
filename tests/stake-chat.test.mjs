import test from 'node:test';
import assert from 'node:assert/strict';
import {stakeChatIntent} from '../lib/stake-chat-intent.mjs';
import {assertChatActive} from '../lib/chat-cancellation.mjs';
import {DomainError} from '../lib/errors.mjs';
import {load} from './helpers/services.mjs';
const roles={main:{account:'alice.near',verifiedAt:1},agent:{account:'agent.near',verifiedAt:1}};
test('typed staking binds the exact amount and verified requested source',()=>{
 assert.deepEqual(stakeChatIntent('Stake 1 NEAR from my agent wallet',{wallet:'alice.near',roles}),{sender:'agent.near',amount:'1'});
 assert.deepEqual(stakeChatIntent('in my main wallet stake 2.5 NEAR with Meta Pool',{wallet:'agent.near',roles}),{sender:'alice.near',amount:'2.5'});
 assert.deepEqual(stakeChatIntent('Can you stake 100 NEAR?',{wallet:'alice.near',roles}),{sender:'alice.near',amount:'100'});
 for(const amount of ['0.1','0','100.01'])assert.match(stakeChatIntent('stake '+amount+' NEAR',{wallet:'alice.near',roles}).error,/1–100/);
 assert.match(stakeChatIntent('stake 1 NEAR from my agent wallet',{wallet:'alice.near',roles:{main:roles.main}}).error,/verify/);
});
test('questions, images, negations and unstaking never prepare a stake',()=>{
 for(const message of ['how do i stake 1 NEAR','do not stake 1 NEAR','unstake 1 NEAR','stake all my NEAR','stake 1 NEAR and send it elsewhere'])assert.equal(stakeChatIntent(message,{wallet:'alice.near',roles}),null);
 assert.equal(stakeChatIntent('stake 1 NEAR',{wallet:'alice.near',roles,imageId:'image'}),null);
});
test('chat prepares one review, persists its card and reuses a repeated request without signing',async()=>{
 const p={walletRoles:roles,messages:[],stakeDrafts:[]};let prepared=0;
 const svc=load('lib/stake-chat.ts',{stakeChatIntent,assertChatActive,DomainError,initialPorti:()=>p,portiConfig:async()=>({p}),mutate:async(_id,fn)=>{fn({porti:p})},stakingAction:async(_id,input)=>{prepared++;assert.equal(input.action,'prepare');assert.equal(input.sender,'agent.near');return {draft:{id:'stake-review',sender:input.sender,amount:input.amount,status:'review'}}}},['stakeChat']);
 const input={message:'stake 1 NEAR from my agent wallet',wallet:'alice.near',requestId:'stake-request-123'};
 const first=await svc.stakeChat('owner',input),second=await svc.stakeChat('owner',input);
 assert.equal(prepared,1);assert.equal(first.cards[0].type,'stake-review');assert.equal(second.reply.id,first.reply.id);assert.equal(p.messages.length,2);
 assert.match(first.reply.content,/Nothing has been signed or sent/);
});
test('subminimum staking gets an explanatory reply without preparation',async()=>{
 const p={walletRoles:roles,messages:[]};
 const svc=load('lib/stake-chat.ts',{stakeChatIntent,assertChatActive,DomainError,initialPorti:()=>p,portiConfig:async()=>({p}),mutate:async(_id,fn)=>fn({porti:p}),stakingAction:()=>assert.fail('must not prepare')},['stakeChat']);
 const reply=await svc.stakeChat('owner',{message:'stake 0.1 NEAR',wallet:'alice.near',requestId:'stake-request-456'});
 assert.equal(reply.cards.length,0);assert.match(reply.reply.content,/1–100/);
});
