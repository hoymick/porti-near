import test from 'node:test';import assert from 'node:assert/strict';
import {accountCode} from '../lib/near-core.mjs';
import {tokenRisk} from '../lib/token-risk.mjs';
import {readContractControls} from '../lib/contract-controls.mjs';
import {createRheaPriceLookup} from '../lib/research-price.mjs';
const empty='11111111111111111111111111111111',globalHash='DtHZA1mUmGYeScEaUoUZYQGGFHSMpnjMCvkr5U9hJXuF';
test('global-contract DAO is a contract, so its treasury is not a non-contract concentration flag',()=>{
 const type=accountCode({code_hash:empty,global_contract_hash:globalHash});assert.equal(type.isContract,true);assert.equal(type.codeHash,globalHash);
 const holder={address:{hash:'justhoot.sputnik-dao.near',is_contract:type.isContract},value:'200000000'};
 const risk=tokenRisk({metadata:{total_supply:'855436076'},holders:[holder]});assert.ok(!risk.flags.some(f=>f.id==='single-holder'));assert.equal(risk.graph.nodes[0].kind,'contract');
 assert.equal(accountCode({code_hash:empty}).isContract,false);
 assert.equal(accountCode({code_hash:'bad'}).isContract,null);
 assert.equal(accountCode({code_hash:empty,global_contract_hash:'bad'}).isContract,null);
});
test('global contract referenced by account stays deployed without inventing a local hash',async()=>{
 const state={code_hash:empty,global_contract_account_id:'shared.near',block_hash:'2'.repeat(44)};
 const evidence=await readContractControls(async()=>state,async()=>({block_hash:state.block_hash,keys:[]}));
 assert.equal(evidence.status,'confirmed');assert.equal(evidence.codeDeployed,true);assert.equal(evidence.codeHash,null);assert.equal(evidence.globalContractAccount,'shared.near');
});
test('independent Rhea research prices cache and coalesce, select exact contract and label fetch time',async()=>{
 let calls=0;const lookup=createRheaPriceLookup(async url=>{calls++;assert.equal(url,'https://api.ref.finance/list-token-price');await new Promise(r=>setTimeout(r,5));return Response.json({'hoot.near':{price:'0.00134'},'other.near':{price:'1'}});},()=>100000);
 const [a,b]=await Promise.all([lookup('hoot.near'),lookup('other.near')]);assert.equal(calls,1);assert.equal(a.usd,0.00134);assert.equal(b.usd,1);assert.equal(a.timestamp,100);assert.match(a.note,/no per-token quote timestamp/);assert.equal(a.liquidityUsd,undefined);
 await lookup('hoot.near');assert.equal(calls,1);await assert.rejects(lookup('missing.near'));await assert.rejects(lookup('HOOT'));
});
test('malformed Rhea quotes and HTTP failures remain unavailable rather than zero',async()=>{
 for(const price of ['N/A','NaN','Infinity','-1','0',null,{}])await assert.rejects(createRheaPriceLookup(async()=>Response.json({'hoot.near':{price}}))('hoot.near'));
 let calls=0;const limited=createRheaPriceLookup(async()=>{calls++;return new Response('',{status:429})});await assert.rejects(limited('hoot.near'));await assert.rejects(limited('hoot.near'));assert.equal(calls,1);
});
