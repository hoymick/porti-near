import test from 'node:test';
import assert from 'node:assert/strict';
import {readContractControls} from '../lib/contract-controls.mjs';
import {tokenRisk,riskReportHtml} from '../lib/token-risk.mjs';
import {readRiskEvidence} from '../lib/risk-evidence.mjs';
import {load} from './helpers/services.mjs';
import {DomainError} from '../lib/errors.mjs';
import * as near from '../lib/near-core.mjs';
const block='2'.repeat(44), code='3'.repeat(44), account={code_hash:code,block_hash:block,block_height:123};
const response=permissions=>({block_hash:block,keys:permissions.map(permission=>({public_key:'ed25519:example',access_key:{permission}}))});
test('reads code and access keys at the exact same final block, with full-access evidence',async()=>{
 const r=await readContractControls(async()=>account,async hash=>{assert.equal(hash,block);return response(['FullAccess',{FunctionCall:{receiver_id:'a.near',method_names:[]}}]);},()=>100);
 assert.equal(r.status,'confirmed');assert.equal(r.fullAccessKeyCount,1);assert.equal(r.functionCallKeyCount,1);assert.equal(r.codeHash,code);assert.equal(r.checkedAt,100);assert.equal(r.keyListComplete,true);
 const risk=tokenRisk({address:'token.near',holders:[],metadata:{},contractControls:r});assert.equal(risk.level,'caution');assert.ok(risk.flags.some(f=>f.id==='contract-full-access'));assert.notEqual(risk.label,'Holder screening unavailable');
 assert.ok(riskReportHtml({address:'token.near',checkedAt:100,holders:[],metadata:{},contractControls:r}).includes('Read-only research evidence'));
});
test('zero full-access keys never assert immutability or safety',async()=>{
 const r=await readContractControls(async()=>account,async()=>response([]));assert.equal(r.fullAccessKeyCount,0);assert.match(r.summary,/does not prove.*immutable/);
 assert.equal(tokenRisk({address:'token.near',metadata:{},holders:[],contractControls:r}).level,'incomplete');
});
test('truncated, unrecognized or mismatched key data never becomes a confirmed empty list',async()=>{
 for(const keys of [{...response([]),last_key:'next'},response([{Unknown:{}}]),{...response([]),block_hash:'4'.repeat(44)},{}]){
  const r=await readContractControls(async()=>account,async()=>keys);assert.equal(r.status,'partial');assert.equal(r.keyListComplete,false);
 }
 const gas=await readContractControls(async()=>account,async()=>response([{GasKeyFullAccess:{balance:'10'}},{GasKeyFunctionCall:{receiver_id:'a.near'}}]));assert.equal(gas.fullAccessKeyCount,1);assert.equal(gas.functionCallKeyCount,1);
});
test('RPC errors preserve partial code evidence without claiming keys were checked',async()=>{
 const r=await readContractControls(async()=>account,async()=>{throw Error('unavailable')});assert.equal(r.status,'partial');assert.equal(r.codeHash,code);assert.equal(r.fullAccessKeyCount,undefined);
 const empty=await readContractControls(async()=>{throw Error()},async()=>response([]));assert.equal(empty.status,'unavailable');
});
test('token investigation retains direct contract checks when the holder indexer is rate limited',async()=>{
 let pinned=false;
 const svc=load('lib/near-services.ts',{
  ...near,DomainError,tokenRisk,readContractControls,readRiskEvidence,env:{},readWorkspace:async()=>({state:{}}),createHolderLookup:()=>async()=>{throw Object.assign(Error('rate limit'),{code:'PROVIDER_RATE_LIMIT'})},
  fetch:async(_url,init)=>{const {method,params}=JSON.parse(init.body);if(method==='status')return Response.json({result:{chain_id:'mainnet'}});
   if(params.request_type==='view_account')return Response.json({result:account});
   if(params.request_type==='view_access_key_list'){assert.equal(params.block_id,block);assert.equal(params.finality,undefined);pinned=true;return Response.json({result:response(['FullAccess'])});}
   const value=params.method_name==='ft_metadata'?{decimals:18,name:'Hoot',symbol:'HOOT'}:'100000000000000000000';return Response.json({result:{result:[...new TextEncoder().encode(JSON.stringify(value))]}});
  }
 },['nearInvestigate']);
 const result=await svc.nearInvestigate('workspace','token','hoot-8ecf65.launchpad.justhoot.near');assert.ok(pinned);assert.equal(result.holderStatus,'unavailable');assert.equal(result.contractControls.fullAccessKeyCount,1);assert.equal(result.risk.level,'caution');assert.match(result.holderAccessHint,/No NearBlocks API key/);
});

