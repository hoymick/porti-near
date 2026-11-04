import test from 'node:test';import assert from 'node:assert/strict';
import ganache from 'ganache';
import {createPublicClient,createWalletClient,custom,parseEther,keccak256,stringToHex} from 'viem';
import {privateKeyToAccount} from 'viem/accounts';
import {compileContracts} from '../scripts/compile-contracts.mjs';
import {quoteTypedData,deliveryTypedData,cancellationTypedData} from '../sdk/authorization.mjs';
import {matchesVaultCode} from '../sdk/vault-code.mjs';
const hash=s=>keccak256(stringToHex(s));
test('vault on a real local EVM',async t=>{
 const compiled=compileContracts();const rpc=ganache.provider({logging:{quiet:true},chain:{chainId:1337,hardfork:'shanghai'},wallet:{totalAccounts:6}});
 const accounts=Object.values(rpc.getInitialAccounts()).map(a=>privateKeyToAccount(a.secretKey));
 const [owner,agent,provider,attestor,fee,attacker]=accounts;
 const chain={id:1337,name:'Local test only',nativeCurrency:{name:'ETH',symbol:'ETH',decimals:18},rpcUrls:{default:{http:['http://127.0.0.1']}}};
 const pc=createPublicClient({chain,transport:custom(rpc),pollingInterval:25,cacheTime:0});
 const wallets=accounts.map(account=>createWalletClient({account,chain,transport:custom(rpc)}));
 const transact=async(accountIndex,address,abi,functionName,args=[])=>{const request=await pc.simulateContract({account:accounts[accountIndex],address,abi,functionName,args});const h=await wallets[accountIndex].writeContract(request.request);return pc.waitForTransactionReceipt({hash:h});};
 const deploy=async(artifact,args=[])=>{const h=await wallets[0].deployContract({abi:artifact.abi,bytecode:'0x'+artifact.evm.bytecode.object,args});return(await pc.waitForTransactionReceipt({hash:h})).contractAddress;};
 const token=await deploy(compiled.token);let count=0;
 async function fixture({daily='20',lifetime='50',call='3',taskCap='5'}={}){
   const vault=await deploy(compiled.vault,[token,attestor.address,fee.address,parseEther(daily),parseEther(lifetime)]);
   const code=await pc.getBytecode({address:vault});const reference={runtime:'0x'+compiled.vault.evm.deployedBytecode.object,immutableReferences:compiled.vault.evm.deployedBytecode.immutableReferences};assert.equal(matchesVaultCode(code,reference),true);assert.equal(matchesVaultCode(code.slice(0,-4)+'ffff',reference),false);
   const write=(name,args=[],who=0)=>transact(who,vault,compiled.vault.abi,name,args);
   const read=(name,args=[])=>pc.readContract({address:vault,abi:compiled.vault.abi,functionName:name,args});
   await transact(0,token,compiled.token.abi,'approve',[vault,parseEther('50')]);await write('deposit',[parseEther('50')]);
   const now=Number((await pc.getBlock()).timestamp);const service=hash('extract');const taskId=hash('task'+count++);
   await write('setService',[service,provider.address,provider.address,true]);
   await write('setAgentPolicy',[agent.address,BigInt(now+10000),parseEther(call),[service]]);
   await write('authorizeTask',[taskId,agent.address,parseEther(taskCap),BigInt(now+10000)]);
   async function quote(overrides={}){
     const q={jobId:hash('job'+count++),taskId,serviceId:service,requestDigest:hash('input'),agent:agent.address,payout:provider.address,agentVersion:1n,providerAmount:parseEther('.98'),platformFee:parseEther('.02'),expiresAt:BigInt(now+1000),deliveryDeadline:BigInt(now+2000),...overrides};
     const typed=quoteTypedData(1337,vault,q);return {q,ps:await provider.signTypedData(typed),as:await agent.signTypedData(typed)};
   }
   const reserve=({q,ps,as})=>write('reserveJob',[q,ps,as],5);
   return {vault,write,read,quote,reserve,taskId,service,now};
 }
 try {
 await t.test('signed reservation, delivery, fee split and provider withdrawal',async()=>{const f=await fixture();const q=await f.quote();await f.reserve(q);assert.equal(await f.read('available'),parseEther('49'));assert.equal(await f.read('reserved'),parseEther('1'));await f.write('settleJob',[q.q.jobId,hash('result')],3);assert.equal(await f.read('credits',[provider.address]),parseEther('.98'));assert.equal(await f.read('credits',[fee.address]),parseEther('.02'));assert.equal(await f.read('reserved'),0n);await f.write('withdrawCredits',[],2);assert.equal(await f.read('credits',[provider.address]),0n);});
 await t.test('replay and double settlement rejected',async()=>{const f=await fixture();const q=await f.quote();await f.reserve(q);await assert.rejects(f.reserve(q));await f.write('settleJob',[q.q.jobId,hash('result')],3);await assert.rejects(f.write('settleJob',[q.q.jobId,hash('again')],3));assert.equal(await f.read('spent'),parseEther('1'));});
 await t.test('payout substitution and foreign signature domain rejected',async()=>{const f=await fixture(),q=await f.quote();await assert.rejects(f.reserve({...q,q:{...q.q,payout:attacker.address}}));const foreign=quoteTypedData(1,f.vault,q.q);await assert.rejects(f.reserve({...q,as:await agent.signTypedData(foreign)}));assert.equal(await f.read('available'),parseEther('50'));});
 await t.test('per-call, task, daily and lifetime caps are enforced onchain',async()=>{for(const settings of [{call:'.5'},{taskCap:'.5'},{daily:'.5'},{lifetime:'.5'}]){const f=await fixture(settings);await assert.rejects(f.reserve(await f.quote()));assert.equal(await f.read('reserved'),0n);}});
 await t.test('revocation stops new jobs but permits existing settlement',async()=>{const f=await fixture();const q=await f.quote();await f.reserve(q);await f.write('revokeAgent',[agent.address]);await assert.rejects(f.reserve(await f.quote()));await f.write('settleJob',[q.q.jobId,hash('result')],3);assert.equal(await f.read('spent'),parseEther('1'));});
 await t.test('only the owner withdraws, reserved funds stay protected',async()=>{const f=await fixture();await f.reserve(await f.quote());await assert.rejects(f.write('withdrawAvailable',[parseEther('1')],5));await assert.rejects(f.write('withdrawAvailable',[parseEther('50')]));await f.write('withdrawAvailable',[parseEther('49')]);assert.equal(await f.read('reserved'),parseEther('1'));});
 await t.test('cancellation releases funds and cannot be applied twice',async()=>{const f=await fixture(),q=await f.quote();await f.reserve(q);await assert.rejects(f.write('cancelJob',[q.q.jobId],5));await f.write('cancelJob',[q.q.jobId],3);assert.equal(await f.read('available'),parseEther('50'));await assert.rejects(f.write('cancelJob',[q.q.jobId],3));});
 await t.test('anyone can expire a job, late settlement fails',async()=>{const f=await fixture(),q=await f.quote({deliveryDeadline:BigInt((await pc.getBlock()).timestamp)+5n});await f.reserve(q);await rpc.request({method:'evm_increaseTime',params:[6]});await rpc.request({method:'evm_mine',params:[]});await assert.rejects(f.write('settleJob',[q.q.jobId,hash('late')],3));await f.write('expireJob',[q.q.jobId],5);assert.equal(await f.read('available'),parseEther('50'));assert.equal(await f.read('reserved'),0n);});
 await t.test('new policy replaces allowlist and invalidates older quotes',async()=>{const f=await fixture(),q=await f.quote();await f.write('setAgentPolicy',[agent.address,BigInt(f.now+10000),parseEther('3'),[]]);await assert.rejects(f.reserve(q));const newer=await f.quote({agentVersion:2n});await assert.rejects(f.reserve(newer));});
 await t.test('attestor replacement cannot seize existing reservations',async()=>{const f=await fixture(),q=await f.quote();await f.reserve(q);await f.write('setAttestor',[attacker.address]);await assert.rejects(f.write('settleJob',[q.q.jobId,hash('bad')],5));await f.write('settleJob',[q.q.jobId,hash('good')],3);});
 await t.test('pause preserves expiry and withdrawal escape paths',async()=>{const f=await fixture(),q=await f.quote();await f.reserve(q);await f.write('setPaused',[true]);await assert.rejects(f.reserve(await f.quote()));await f.write('withdrawAvailable',[parseEther('49')]);await f.write('cancelJob',[q.q.jobId],3);await f.write('withdrawAvailable',[parseEther('1')]);assert.equal(await f.read('available'),0n);});
 await t.test('signed delivery can be relayed without attestor gas and cannot be replayed',async()=>{const f=await fixture(),q=await f.quote();await f.reserve(q);const until=BigInt(f.now+1000),digest=hash('delivered');const signature=await attestor.signTypedData(deliveryTypedData(1337,f.vault,q.q.jobId,digest,until));await assert.rejects(f.write('settleJobWithSignature',[q.q.jobId,hash('tampered'),until,signature],5));await f.write('settleJobWithSignature',[q.q.jobId,digest,until,signature],5);await assert.rejects(f.write('settleJobWithSignature',[q.q.jobId,digest,until,signature],5));await f.write('withdrawCreditsFor',[provider.address],5);assert.equal(await f.read('credits',[provider.address]),0n);});
 await t.test('signed cancellation restores funds without giving the relayer withdrawal authority',async()=>{const f=await fixture(),q=await f.quote();await f.reserve(q);const until=BigInt(f.now+900),signature=await attestor.signTypedData(cancellationTypedData(1337,f.vault,q.q.jobId,until));await assert.rejects(f.write('cancelJobWithSignature',[hash('different job'),until,signature],5));await f.write('cancelJobWithSignature',[q.q.jobId,until,signature],5);assert.equal(await f.read('available'),parseEther('50'));assert.equal(await f.read('reserved'),0n);await assert.rejects(f.write('cancelJobWithSignature',[q.q.jobId,until,signature],5));});
 } finally { await rpc.disconnect(); }
});
