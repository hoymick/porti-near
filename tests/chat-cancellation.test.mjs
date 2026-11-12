import test from 'node:test';
import assert from 'node:assert/strict';
import {cancelChatTurn,assertChatActive} from '../lib/chat-cancellation.mjs';
test('stop targets only the selected turn and retains reviews and receipts',()=>{
 const p={chatLock:{id:'active-turn-123'},pendingChatTransfer:{amount:'0.5'},drafts:[{id:'review'}],receipts:[{hash:'saved'}]};
 cancelChatTurn(p,'other-turn-123',100);
 assert.equal(p.chatLock.id,'active-turn-123');assert.equal(p.pendingChatTransfer.amount,'0.5');
 cancelChatTurn(p,'active-turn-123',101);
 assert.equal(p.chatLock,undefined);assert.equal(p.pendingChatTransfer,undefined);
 assert.deepEqual(p.drafts,[{id:'review'}]);assert.deepEqual(p.receipts,[{hash:'saved'}]);
 assert.throws(()=>assertChatActive(p,'active-turn-123'),{code:'CHAT_CANCELLED'});
 assert.doesNotThrow(()=>assertChatActive(p,'fresh-turn-123'));
});
test('cancellation arriving before turn acquisition blocks late execution',()=>{
 const p={};cancelChatTurn(p,'not-started-123');
 assert.throws(()=>assertChatActive(p,'not-started-123'),{code:'CHAT_CANCELLED'});
});
test('invalid cancellations do not mutate state and markers are bounded',()=>{
 const p={};assert.throws(()=>cancelChatTurn(p,'bad'));assert.deepEqual(p,{});
 for(let i=0;i<50;i++)cancelChatTurn(p,'valid-turn-'+i,i);
 assert.equal(p.cancelledChatTurns.length,30);
 cancelChatTurn(p,'valid-later-123',700000);assert.equal(p.cancelledChatTurns.length,1);
});
