import test from 'node:test';
import assert from 'node:assert/strict';
import {swapProgress,uniqueTransactionCards} from '../lib/transaction-progress.mjs';
test('a submitted deposit is pending until provider settlement, with distinct terminal outcomes',()=>{
 for(const status of [undefined,'PENDING_DEPOSIT','KNOWN_DEPOSIT_TX','PROCESSING','UNKNOWN'])assert.equal(swapProgress({status:'submitted',providerStatus:status}).terminal,false);
 assert.match(swapProgress({providerStatus:'SUCCESS'}).message,/provider reports success/);
 assert.equal(swapProgress({providerStatus:'SUCCESS'}).tone,'success');
 for(const status of ['FAILED','REFUNDED','INCOMPLETE_DEPOSIT']){const result=swapProgress({providerStatus:status});assert.equal(result.terminal,true);assert.notEqual(result.tone,'success');}
});
test('one review renders once, preserving distinct payments and the original stored history',()=>{
 const card={type:'transfer',draft:{id:'same'}},other={type:'transfer',draft:{id:'new'}};
 const messages=[{id:'old',cards:[card,{type:'account',snapshot:{}}]},{id:'recent',cards:[card,other]}];
 const before=structuredClone(messages),out=uniqueTransactionCards(messages,{id:'same'});
 assert.equal(out.extraDraft,null);assert.equal(out.messages[0].cards.length,1);assert.equal(out.messages[1].cards.length,2);
 assert.deepEqual(messages,before);
 assert.deepEqual(uniqueTransactionCards(messages,{id:'third'}).extraDraft,{id:'third'});
});
test('repeated swap cards collapse by saved order, independent orders remain',()=>{
 const out=uniqueTransactionCards([{cards:[{type:'swap-review',id:'first',order:{id:'order'}}]},{cards:[{type:'swap-review',id:'second',order:{id:'order'}},{type:'swap-review',id:'third',order:{id:'different'}}]}]);
 assert.equal(out.messages[0].cards.length,0);assert.equal(out.messages[1].cards.length,2);
});
