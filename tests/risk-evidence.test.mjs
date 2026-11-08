import test from 'node:test';import assert from 'node:assert/strict';
import {wasmExports,wasmHash,inspectTokenCode,inspectDclPool,inspectDeclaredPositions} from '../lib/risk-evidence.mjs';
import {tokenRisk,riskReportHtml} from '../lib/token-risk.mjs';
const block='2'.repeat(44), token='hoot.near', pool=token+'|wrap.near|10000';
const leb=n=>{const out=[];do{let b=n&127;n>>>=7;if(n)b|=128;out.push(b);}while(n);return out;};
const wasm=names=>{const body=[...leb(names.length)];for(const name of names){const b=[...new TextEncoder().encode(name)];body.push(...leb(b.length),...b,0,0);}return new Uint8Array([0,97,115,109,1,0,0,0,7,...leb(body.length),...body]);};
const json=value=>({block_hash:block,result:[...new TextEncoder().encode(JSON.stringify(value))]});
const params=p=>JSON.parse(atob(p.args_base64));
test('bounded export parser rejects malformed lengths and truncation',()=>{
 assert.deepEqual(wasmExports(wasm(['ft_transfer','mint','get_owner'])),['ft_transfer','mint','get_owner']);
 for(const bytes of [new Uint8Array(2),wasm(['mint']).slice(0,-1),new Uint8Array([0,97,115,109,1,0,0,0,7,255,255,255,255,255])])assert.throws(()=>wasmExports(bytes));
});
test('code screening hash matches deployed bytes, reads only supported exported getters at same block',async()=>{
 const bytes=wasm(['ft_transfer','mint','get_owner','is_paused','contract_source_metadata']);const hash=await wasmHash(bytes);const methods=[];
 const code=await inspectTokenCode(token,{blockHash:block,codeHash:hash,codeSource:'account'},async p=>{
  assert.equal(p.block_id,block);if(p.request_type==='view_code')return {block_hash:block,code_base64:Buffer.from(bytes).toString('base64')};
  assert.equal(p.request_type,'call_function');assert.equal(p.account_id,token);methods.push(p.method_name);
  return json(p.method_name==='get_owner'?'dao.near':p.method_name==='is_paused'?false:{version:'1',link:'https://example.com/source'});
 });
 assert.equal(code.status,'observed');assert.ok(code.candidateControlMethods.includes('mint'));assert.ok(code.reads.some(r=>r.method==='get_owner'&&r.value==='dao.near'));assert.ok(!methods.includes('mint'));assert.match(code.coverage,/not establish authorization/);
 const bad=await inspectTokenCode(token,{blockHash:block,codeHash:'3'.repeat(44),codeSource:'account'},async()=>({block_hash:block,code_base64:Buffer.from(bytes).toString('base64')}));assert.equal(bad.status,'unavailable');
});
test('DCL adapter returns exact balances, documented fees and two read-only quotes without claiming LP locks or zero token taxes',async()=>{
 const calls=[];const data={pool_id:pool,token_x:token,token_y:'wrap.near',fee:10000,total_x:'9000000',total_y:'1000000000000000000000000',state:'Running',tax:null};
 const dex=await inspectDclPool(token,{decimals:6},{blockHash:block,blockHeight:50},async p=>{
  assert.equal(p.account_id,'dclv2.ref-labs.near');assert.equal(p.block_id,block);calls.push(p.method_name);const args=params(p);
  if(p.method_name==='get_pool'){if(args.pool_id!==pool)throw Error('no pool');return json(data);}
  assert.equal(p.method_name,'quote');assert.deepEqual(args.pool_ids,[pool]);return json({amount:args.input_token===token?'1000000000000000000000':'5000'});
 });
 assert.equal(dex.status,'observed');assert.equal(dex.tokenBalanceFormatted,'9');assert.equal(dex.wrappedNearBalanceFormatted,'1');assert.equal(dex.poolFeePercent,1);assert.equal(dex.poolTaxField,null);assert.equal(dex.quotes.sell.status,'output_returned');assert.equal(dex.quotes.buy.status,'output_returned');assert.equal(dex.lpLock.status,'not_verified');assert.equal(calls.filter(x=>x==='get_pool').length,4);assert.equal(calls.filter(x=>x==='quote').length,2);
 const snapshot={address:token,checkedAt:1,metadata:{},holders:[],researchChecks:{dex}};const risk=tokenRisk(snapshot);assert.match(risk.observations.join(' '),/does not establish token transfer taxes/);assert.match(risk.unknowns.join(' '),/locks\/burns/);assert.ok(riskReportHtml(snapshot).includes('Read-only sell quote'));
});
test('bad pool identities and inconsistent blocks remain unavailable; quote failures never become sellability verdicts',async()=>{
 for(const corrupt of [{pool_id:'wrong'}, {token_x:'other.near'},{total_y:'bad'}]){
  const d=await inspectDclPool(token,{decimals:6},{blockHash:block},async p=>{const args=params(p);return json({pool_id:args.pool_id,token_x:token,token_y:'wrap.near',fee:Number(args.pool_id.split('|')[2]),total_x:'1',total_y:'1',...corrupt});});assert.equal(d.status,'unavailable');
 }
 const d=await inspectDclPool(token,{decimals:6},{blockHash:block},async p=>{if(p.method_name==='quote')throw Error();const a=params(p);return json({pool_id:a.pool_id,token_x:token,token_y:'wrap.near',fee:Number(a.pool_id.split('|')[2]),total_x:'1',total_y:'1',state:'Paused'});});assert.equal(d.status,'observed');assert.equal(d.quotes.sell.status,'unavailable');assert.ok(tokenRisk({address:token,metadata:{},holders:[],researchChecks:{dex:d}}).flags.some(f=>f.id==='pool-state'));
});

test('declared positions require the supported code and matching exchange owner, and never imply locked liquidity',async()=>{
 const contract='hoot.near',id='hoot.near|wrap.near|10000#1',code={reads:[{method:'get_config',status:'returned',value:{dcl_exchange_id:'dclv2.ref-labs.near',dcl_pool_id:'hoot.near|wrap.near|10000',dcl_lpt_ids:[id]}}]};
 const controls={codeHash:'2uPhSwUzMbV9MHHitiWUKTdPeRGYXHJungpoH5kDbL2d',blockHash:block};
 for(const owner of [contract,'other.near']){const result=await inspectDeclaredPositions(contract,controls,code,async p=>{assert.equal(p.method_name,'list_liquidities');assert.equal(params(p).account_id,contract);assert.equal(p.block_id,block);return json([{lpt_id:id,pool_id:'hoot.near|wrap.near|10000',owner_id:owner,left_point:0,right_point:100}]);});assert.equal(result.status,'observed');assert.equal(result.positions[0].listedForTokenAccount,owner===contract);assert.equal(result.lockStatus,'not_verified');}
 assert.equal((await inspectDeclaredPositions(contract,{...controls,codeHash:'3'.repeat(44)},code,async()=>{throw Error()})).status,'unavailable');
});
