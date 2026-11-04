import test from 'node:test';
import assert from 'node:assert/strict';
import { z } from 'zod';
import { DomainError } from '../lib/errors.mjs';
import { nearAccountOK } from '../lib/near-core.mjs';
import { load } from './helpers/services.mjs';
const sdk = load('sdk/porti-apps.ts',{z},['definePortiApp']);
const {portiApps,registeredApp} = load('lib/porti-app-registry.ts',sdk,['portiApps','registeredApp']);
function service(outputs) {
 const calls=[];
 const svc=load('lib/porti-apps.ts',{DomainError,nearAccountOK,registeredApp,nearRpc:async(id,method,args)=>{calls.push({id,method,args});const output=outputs.shift();return {result:[...new TextEncoder().encode(JSON.stringify(output))],block_hash:'final-block',block_height:12345}}},['runPortiApp']);
 return {...svc,calls};
}
test('manifest rejects write permissions, extra fields, insecure URLs and duplicate actions',()=>{
 const valid=portiApps[0];
 for(const bad of [{...valid,permissions:['wallet:sign']},{...valid,website:'http://example.com'},{...valid,endpoint:'https://evil.test'},{...valid,actions:[valid.actions[0],valid.actions[0]]},{...valid,actions:[{...valid.actions[0],effect:'write'}]}])assert.throws(()=>sdk.definePortiApp(bad));
});
test('unknown actions and unbounded or foreign inputs never make an RPC call',async()=>{
 const s=service([]);
 for(const [app,action,args] of [['unknown','read-pool',{}],['rhea-pools','swap',{poolId:0}],['rhea-pools','read-pool',{poolId:-1}],['rhea-pools','read-pool',{poolId:0,url:'https://evil.test'}],['rhea-pools','read-pool',{poolId:'0'}],['near-staking','read-pool',{poolAccount:'alice.near'}]])await assert.rejects(s.runPortiApp('owner',app,action,args));
 assert.equal(s.calls.length,0);
});
test('exchange reads exactly one pool and pins subsequent reads to finalized block hash',async()=>{
 const s=service([10,[{token_account_ids:['wrap.near','usdt.tether-token.near'],amounts:['123','456'],total_fee:30,pool_kind:'SIMPLE_POOL'}]]);
 const r=await s.runPortiApp('alice','rhea-pools','read-pool',{poolId:2});
 assert.deepEqual(r.data.reservesRaw,['123','456']);assert.equal(r.data.feeBps,30);assert.equal(r.evidence.length,2);
 assert.equal(s.calls[0].args.finality,'final');assert.equal(s.calls[1].args.block_id,'final-block');assert.equal(s.calls[1].args.finality,undefined);
 assert.deepEqual(JSON.parse(atob(s.calls[1].args.args_base64)),{from_index:2,limit:1});
});
test('missing and malformed exchange pools fail without invented results',async()=>{
 await assert.rejects(service([1]).runPortiApp('a','rhea-pools','read-pool',{poolId:1}),/outside/);
 await assert.rejects(service([1,[{token_account_ids:['wrap.near','bad'],amounts:['1'],total_fee:30}]]).runPortiApp('a','rhea-pools','read-pool',{poolId:0}),/unsupported/);
});
test('staking retains exact integer balance and rejects impossible reward fee',async()=>{
 const s=service(['123456789012345678901234567890',42,{numerator:5,denominator:100}]);
 const r=await s.runPortiApp('a','near-staking','read-pool',{poolAccount:'example.poolv1.near'});
 assert.equal(r.data.totalStakedYocto,'123456789012345678901234567890');assert.equal(s.calls.length,3);
 assert.deepEqual(s.calls.map(c=>c.args.method_name),['get_total_staked_balance','get_number_of_accounts','get_reward_fee_fraction']);
 await assert.rejects(service(['1',1,{numerator:101,denominator:100}]).runPortiApp('a','near-staking','read-pool',{poolAccount:'example.poolv1.near'}),/unsupported/);
});
test('provider failure propagates without a fabricated response',async()=>{
 const {runPortiApp}=load('lib/porti-apps.ts',{DomainError,nearAccountOK,registeredApp,nearRpc:async()=>{throw new Error('RPC unavailable')}},['runPortiApp']);
 await assert.rejects(runPortiApp('a','rhea-pools','read-pool',{poolId:0}),/RPC unavailable/);
});
test('app routes enforce owner and origin before mutations, and pins are idempotent per workspace',async()=>{
 const states={alice:{porti:{pinnedApps:[]}},bob:{porti:{pinnedApps:[]}}};let current='alice',blocked=false;
 const route=load('app/api/porti/apps/route.ts',{DomainError,portiApps,registeredApp,runPortiApp:async()=>({}),initialPorti:()=>({}),owner:async()=>{if(!current)throw Error('Sign in');return current},readWorkspace:async id=>({state:states[id]}),mutate:async(id,fn)=>fn(states[id]),sameOrigin:()=>{if(blocked)throw Error('Origin blocked')},readJSON:async req=>req.json(),limit:async()=>{},errorResponse:e=>Response.json({error:e.message},{status:400})},['GET','POST']);
 const pin=()=>route.POST(new Request('https://porti.test/api/porti/apps',{method:'POST',body:JSON.stringify({action:'pin',appId:'rhea-pools',pinned:true})}));
 await pin();await pin();assert.deepEqual(states.alice.porti.pinnedApps,['rhea-pools']);
 current='bob';assert.deepEqual((await (await route.GET()).json()).pinned,[]);
 blocked=true;assert.equal((await pin()).status,400);assert.deepEqual(states.bob.porti.pinnedApps,[]);
 current='';assert.equal((await route.GET()).status,400);
});
test('Meta Pool uses its fixed contract and exact reference/supply units at one block',async()=>{
 const s=service(['1456789012345678901234567','2000000000000000000000000000000',{decimals:24}]);
 const r=await s.runPortiApp('a','meta-pool','read-state',{});
 assert.equal(r.data.stNearPriceYocto,'1456789012345678901234567');assert.equal(r.data.decimals,24);
 assert.ok(s.calls.every(c=>c.args.account_id==='meta-pool.near'));assert.ok(s.calls.slice(1).every(c=>c.args.block_id==='final-block'));
 await assert.rejects(service([]).runPortiApp('a','meta-pool','read-state',{contract:'evil.near'}));
 await assert.rejects(service(['1','1',{decimals:90}]).runPortiApp('a','meta-pool','read-state',{}),/unsupported/);
});
test('SocialDB reads only the named account public profile keys, supports leaves and handles missing profiles',async()=>{
 const s=service([{'alice.near':{profile:{name:{'':'Alice'},description:'<script>untrusted</script>'}}}]);
 const r=await s.runPortiApp('a','near-social','read-profile',{account:'alice.near'});
 assert.equal(r.data.name,'Alice');assert.equal(r.data.bio,'<script>untrusted</script>');
 assert.equal(s.calls[0].args.account_id,'social.near');assert.deepEqual(JSON.parse(atob(s.calls[0].args.args_base64)),{keys:['alice.near/profile/name','alice.near/profile/description']});
 assert.equal((await service([{}]).runPortiApp('a','near-social','read-profile',{account:'alice.near'})).data.found,false);
 await assert.rejects(service([]).runPortiApp('a','near-social','read-profile',{account:'*/profile/**'}));
});
test('AstroDAO pins configuration and proposal reads and bounds the proposal window',async()=>{
 const s=service([{name:'DAO',purpose:'Public governance'},12,[{id:10,status:'Approved',description:'A proposal'}]]);
 const r=await s.runPortiApp('a','astro-dao','read-dao',{daoAccount:'example.sputnik-dao.near'});
 assert.equal(r.data.nextProposalId,12);assert.equal(r.data.proposals[0].id,10);
 assert.deepEqual(JSON.parse(atob(s.calls[2].args.args_base64)),{from_index:7,limit:5});
 assert.ok(s.calls.every(c=>c.args.account_id==='example.sputnik-dao.near'));
 await assert.rejects(service([]).runPortiApp('a','astro-dao','read-dao',{daoAccount:'alice.near'}));
 await assert.rejects(service([{name:'DAO',purpose:'x'},2,[{id:4,status:'x',description:'x'}]]).runPortiApp('a','astro-dao','read-dao',{daoAccount:'example.sputnik-dao.near'}),/unsupported/);
 const empty=service([{name:'DAO',purpose:'x'},0]);assert.equal((await empty.runPortiApp('a','astro-dao','read-dao',{daoAccount:'example.sputnik-dao.near'})).data.proposals.length,0);assert.equal(empty.calls.length,2);
});
