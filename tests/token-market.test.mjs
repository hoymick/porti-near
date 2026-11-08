import test from 'node:test';
import assert from 'node:assert/strict';
import {load} from './helpers/services.mjs';
import {nearAccountOK} from '../lib/near-core.mjs';
import {DomainError} from '../lib/errors.mjs';
const pool=(contract,side='base',reserve='100',price='0.012')=>({id:'near_pool-'+reserve,attributes:{reserve_in_usd:reserve,[side+'_token_price_usd']:price,volume_usd:{h24:'25'},transactions:{h24:{buys:2,sells:3}}},relationships:{[side+'_token']:{data:{id:'near_'+contract}}}});
const service=fetch=>load('lib/token-chart.ts',{nearAccountOK,DomainError,fetch,candles:()=>[],reading:()=>null},['tokenMarket','tokenChart','selectTokenPool']);
test('market lookup works without candles and takes the matching largest pool and correct token side',async()=>{
 let calls=0;
 const {tokenMarket}=service(async url=>{calls++;assert.ok(!url.includes('ohlcv'));return Response.json({data:[pool('wrong.near','base','99999'),pool('hoot.near','base','10'),pool('hoot.near','quote','100','0.024')]});});
 const a=await tokenMarket('hoot.near');
 assert.equal(a.usd,0.024);assert.equal(a.liquidityUsd,100);assert.equal(a.volume24hUsd,25);assert.equal(a.buys24h,2);assert.equal(a.sells24h,3);assert.equal(a.tokenSide,'quote');assert.equal(calls,1);
 await tokenMarket('hoot.near');assert.equal(calls,1);
});
test('failed chart does not discard a successful market snapshot',async()=>{
 let calls=0;const {tokenMarket,tokenChart}=service(async url=>{calls++;return Response.json(url.includes('ohlcv')?{data:{attributes:{ohlcv_list:[]}}}:{data:[pool('hoot.near')]});});
 await assert.rejects(tokenChart('hoot.near'),{code:'NO_CANDLES'});
 assert.equal((await tokenMarket('hoot.near')).usd,0.012);assert.equal(calls,2);
});
test('concurrent market requests coalesce and malformed or uncovered data stays unavailable',async()=>{
 let calls=0;const {tokenMarket}=service(async()=>{calls++;await new Promise(r=>setTimeout(r,10));return Response.json({data:[pool('hoot.near')]});});
 await Promise.all([tokenMarket('hoot.near'),tokenMarket('hoot.near')]);assert.equal(calls,1);
 for(const data of [{data:[pool('wrong.near')]},{data:[pool('hoot.near','base','Infinity')]},{}]){
  const svc=service(async()=>Response.json(data));await assert.rejects(svc.tokenMarket('hoot.near'));
 }
});
test('zero and missing price or activity fields are not invented and rate limits remain errors',async()=>{
 const p=pool('hoot.near','base','100','0');delete p.attributes.volume_usd;delete p.attributes.transactions;
 const m=await service(async()=>Response.json({data:[p]})).tokenMarket('hoot.near');
 assert.equal(m.usd,null);assert.equal(m.volume24hUsd,null);assert.equal(m.sells24h,null);
 await assert.rejects(service(async()=>new Response('',{status:429})).tokenMarket('hoot.near'),{code:'MARKET_COOLDOWN'});
});
