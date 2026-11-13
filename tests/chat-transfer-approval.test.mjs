import test from 'node:test';
import assert from 'node:assert/strict';
import {isTransferApproval,latestChatTransfer} from '../lib/chat-transfer-approval.mjs';
const draft={id:'review-1',sender:'alice.near',recipient:'agent.near',token:'near',amount:'0.5',symbol:'NEAR',storageDeposit:'0',expiresAt:2000,status:'awaiting_review'};
const reply={role:'assistant',cards:[{type:'transfer',draft}]};
test('typed confirmation binds to the displayed active review only',()=>{
  for(const text of ['yes','YES!','approve','yes please','approve in wallet','confirm.'])assert.ok(isTransferApproval(text));
  for(const text of ['do not approve','yes but send 5','yesterday','approve another transfer'])assert.ok(!isTransferApproval(text));
  assert.equal(latestChatTransfer([reply],[draft],'alice.near',1000),draft);
  assert.equal(latestChatTransfer([reply],[],'alice.near',1000),null);
  assert.equal(latestChatTransfer([reply],[draft],'bob.near',1000),null);
  assert.equal(latestChatTransfer([reply],[draft],'alice.near',2000),null);
});
test('unrelated turns, ambiguous reviews and changed amounts cannot be approved',()=>{
  for(const messages of [[reply,{role:'assistant',cards:[]}],[reply,{role:'user',content:'new topic'}],[{...reply,cards:[...reply.cards,...reply.cards]}]])assert.equal(latestChatTransfer(messages,[draft],'alice.near',1000),null);
  for(const change of [{amount:'5'},{recipient:'other.near'},{storageDeposit:'99'},{expiresAt:3000},{status:'wallet_requested'},{status:'submitted'},{status:'finalized'},{status:'cancelled'}])assert.equal(latestChatTransfer([reply],[{...draft,...change}],'alice.near',1000),null);
});
