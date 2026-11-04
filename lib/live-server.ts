import {env} from 'cloudflare:workers';
import {createPublicClient,http,keccak256,toHex,isAddress,parseUnits,erc20Abi,decodeEventLog} from 'viem';
import {privateKeyToAccount} from 'viem/accounts';
import artifact from './vault-artifact.json';
import {MAINNET,WIF_TOKEN,serviceKey} from './live-config.mjs';
import {quoteTypedData,deliveryTypedData,cancellationTypedData} from '../sdk/authorization.mjs';
import {DomainError,SERVICES,runService} from './engine.mjs';
import {mutate,readWorkspace} from './workspace';
import {matchesVaultCode} from '../sdk/vault-code.mjs';
const runtime=env as unknown as Record<string,string>;
const encode=(value:unknown)=>keccak256(toHex(JSON.stringify(value)));
const serialize=(o:unknown)=>JSON.parse(JSON.stringify(o,(_,v)=>typeof v==='bigint'?v.toString():v));
function signers(){
 if(!runtime.WIF_PROVIDER_KEY||!runtime.WIF_ATTESTOR_KEY||!runtime.WIF_FEE_KEY)throw new DomainError('SIGNERS_NOT_CONFIGURED','Live service signing is not configured.',503);
 return{provider:privateKeyToAccount(runtime.WIF_PROVIDER_KEY as `0x${string}`),attestor:privateKeyToAccount(runtime.WIF_ATTESTOR_KEY as `0x${string}`),fee:privateKeyToAccount(runtime.WIF_FEE_KEY as `0x${string}`)};
}
function client(){return createPublicClient({chain:MAINNET,transport:http(runtime.ROBINHOOD_RPC_URL||MAINNET.rpcUrls.default.http[0],{timeout:12000,retryCount:1}),cacheTime:0});}
async function rpcKey(){const digest=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(runtime.WIF_ATTESTOR_KEY));return crypto.subtle.importKey('raw',digest,'AES-GCM',false,['encrypt','decrypt']);}
async function encryptRpc(url:string,ownerId:string){const iv=crypto.getRandomValues(new Uint8Array(12)),data=await crypto.subtle.encrypt({name:'AES-GCM',iv,additionalData:new TextEncoder().encode(ownerId)},await rpcKey(),new TextEncoder().encode(url));return{iv:Array.from(iv),data:btoa(String.fromCharCode(...new Uint8Array(data)))};}
async function decryptRpc(value:any,ownerId:string){const raw=Uint8Array.from(atob(value.data),c=>c.charCodeAt(0));const clear=await crypto.subtle.decrypt({name:'AES-GCM',iv:new Uint8Array(value.iv),additionalData:new TextEncoder().encode(ownerId)},await rpcKey(),raw);return new TextDecoder().decode(clear);}
export function liveConfig(){try{const x=signers();return{ready:true,chain:MAINNET,token:WIF_TOKEN,provider:x.provider.address,attestor:x.attestor.address,feeRecipient:x.fee.address,abi:artifact.abi,bytecode:artifact.bytecode};}catch{return{ready:false,chain:MAINNET,token:WIF_TOKEN,message:'Live signer setup is not configured.'};}}
async function vaultRead(vault:`0x${string}`,name:string,args:unknown[]=[]):Promise<any>{return client().readContract({address:vault,abi:artifact.abi,functionName:name,args} as any);}
function taskIn(s:any,id:string){const t=s.liveTasks?.find((t:any)=>t.id===id);if(!t)throw new DomainError('NOT_FOUND','Live task not found.',404);return t;}
export function safeLiveTask({documents,salt,jobs,...task}:any){return{...task,jobs:jobs.map(({output,...job}:any)=>job)};}
export async function liveAction(ownerId:string,input:any){
 const {action}=input,now=Math.floor(Date.now()/1000),{provider,attestor,fee}=signers();
 const ownerState=(await readWorkspace(ownerId)).state;
 const rpcUrl=ownerState.rpcCipher?await decryptRpc(ownerState.rpcCipher,ownerId):runtime.ROBINHOOD_RPC_URL||MAINNET.rpcUrls.default.http[0];
 const client=()=>createPublicClient({chain:MAINNET,transport:http(rpcUrl,{timeout:12000,retryCount:1}),cacheTime:0});
 const vaultRead=async(vault:`0x${string}`,name:string,args:unknown[]=[]):Promise<any>=>client().readContract({address:vault,abi:artifact.abi,functionName:name,args} as any);
 if(action==='save-rpc'){
   let url;try{url=new URL(input.url);}catch{throw new DomainError('INVALID_RPC','Enter a valid HTTPS RPC endpoint.');}
   const host=url.hostname.toLowerCase();if(url.protocol!=='https:'||url.username||url.password||url.port||url.hash||!(host.endsWith('.g.alchemy.com')||host.endsWith('.quiknode.pro')||host.endsWith('.core.chainstack.com')||host==='rpc.mainnet.chain.robinhood.com'))throw new DomainError('INVALID_RPC','Use an HTTPS Alchemy, QuickNode, Chainstack or official Robinhood Chain RPC endpoint.');
   const p=createPublicClient({chain:MAINNET,transport:http(url.href,{timeout:12000,retryCount:0})});if(await p.getChainId()!==4663)throw new DomainError('WRONG_NETWORK','This endpoint is not Robinhood Chain mainnet.');
   const encrypted=await encryptRpc(url.href,ownerId);await mutate(ownerId,s=>{s.rpcCipher=encrypted;});return{saved:true};
 }
 if(action==='network'){
   try{const p=client(),[chainId,symbol,decimals,code]=await Promise.all([p.getChainId(),p.readContract({address:WIF_TOKEN,abi:erc20Abi,functionName:'symbol'}),p.readContract({address:WIF_TOKEN,abi:erc20Abi,functionName:'decimals'}),p.getBytecode({address:WIF_TOKEN})]);if(chainId!==4663||symbol.toUpperCase()!=='WIF'||!code||decimals>18)throw new Error('Unexpected network or token');return{reachable:true,chainId,symbol,decimals};}catch{throw new DomainError('RPC_UNAVAILABLE','The live service cannot reach or verify Robinhood Chain. Configure a reliable RPC endpoint before using real WIF.',503);}
 }
 if(action==='create'){
   if(!isAddress(input.vault)||!isAddress(input.wallet)||!isAddress(input.agent))throw new DomainError('INVALID_ADDRESS','Connect your wallet and vault first.');
   if(!Array.isArray(input.documents)||input.documents.length!==2||input.documents.some((d:any)=>typeof d!=='string'||!d.trim()||d.length>30000))throw new DomainError('INVALID_DOCUMENTS','Provide two documents up to 30,000 characters each.');
   runService('extract',{documents:input.documents});
   if(typeof input.title!=='string'||!input.title.trim()||input.title.length>100)throw new DomainError('INVALID_TITLE','Use a task title of 1–100 characters.');
   if(typeof input.maxSpend!=='string'||!/^\d+(\.\d{1,6})?$/.test(input.maxSpend)||Number(input.maxSpend)<=0||Number(input.maxSpend)>100)throw new DomainError('INVALID_CAP','Use a task cap between 0 and 100 WIF.');
   const pc=client();const [chainId,vaultOwner,token,signer,platform,decimals,symbol,code]=await Promise.all([pc.getChainId(),vaultRead(input.vault,'owner'),vaultRead(input.vault,'token'),vaultRead(input.vault,'attestor'),vaultRead(input.vault,'feeRecipient'),pc.readContract({address:WIF_TOKEN,abi:erc20Abi,functionName:'decimals'}),pc.readContract({address:WIF_TOKEN,abi:erc20Abi,functionName:'symbol'}),pc.getBytecode({address:input.vault})]);
   if(!matchesVaultCode(code,artifact))throw new DomainError('INVALID_VAULT','This contract does not match the current WIF PORT vault code.');
   if(chainId!==4663||token.toLowerCase()!==WIF_TOKEN.toLowerCase()||vaultOwner.toLowerCase()!==input.wallet.toLowerCase()||signer.toLowerCase()!==attestor.address.toLowerCase()||platform.toLowerCase()!==fee.address.toLowerCase()||symbol.toUpperCase()!=='WIF'||decimals>18)throw new DomainError('VAULT_MISMATCH','Vault, network, service signers or token configuration does not match this gateway.');
   const t={id:keccak256(toHex(crypto.randomUUID())),title:input.title.trim(),documents:input.documents,maxSpend:input.maxSpend,decimals,vault:input.vault,wallet:input.wallet,agent:input.agent,createdAt:Date.now(),deadline:now+86400,stage:0,status:'awaiting_authorization',output:null,jobs:[],salt:crypto.randomUUID()};
   await mutate(ownerId,s=>{s.liveTasks??=[];if(s.liveTasks.length>=50)throw new DomainError('TASK_LIMIT','This release supports 50 live task records.');s.liveTasks.unshift(t);});return{task:serialize({...t,documents:undefined,salt:undefined})};
 }
 const {state}=await readWorkspace(ownerId);const t=taskIn(state,input.taskId);
 if(action==='quote'){
   if(t.stage>=3)return{completed:true};
   if(!t.documents)throw new DomainError('INPUT_EXPIRED','Task documents are no longer available.');
   const existing=t.jobs.find((j:any)=>j.stage===t.stage&&j.status!=='expired');
   if(existing){if(now<Number(existing.quote.expiresAt)||existing.status==='reserved')return{quote:existing.quote,providerSignature:existing.providerSignature,jobId:existing.id};const chainJob=await vaultRead(t.vault,'jobs',[existing.id]);if(Number(chainJob[7])===1||Number(chainJob[7])===2)return{quote:existing.quote,providerSignature:existing.providerSignature,jobId:existing.id};throw new DomainError('QUOTE_EXPIRED','Quote expired before reservation. Create a new live task.');}
   const taskAuth=await vaultRead(t.vault,'tasks',[t.id]);if(taskAuth[0].toLowerCase()!==t.agent.toLowerCase()||taskAuth[1]!==parseUnits(t.maxSpend,t.decimals))throw new DomainError('TASK_NOT_AUTHORIZED','Authorize this task in your wallet first.');
   const p=await vaultRead(t.vault,'agents',[t.agent]),service=SERVICES[t.stage],total=parseUnits(String(service.price/1000000),t.decimals),platformFee=total*BigInt(200)/BigInt(10000);
   const q={jobId:keccak256(toHex(crypto.randomUUID())),taskId:t.id,serviceId:keccak256(toHex(serviceKey(service.id))),requestDigest:encode({salt:t.salt,stage:t.stage,input:t.stage?t.output:t.documents}),agent:t.agent,payout:provider.address,agentVersion:p[0],providerAmount:total-platformFee,platformFee,expiresAt:BigInt(now+1200),deliveryDeadline:BigInt(Math.min(now+3600,t.deadline))};
   const signature=await provider.signTypedData(quoteTypedData(4663,t.vault,q) as any);
   const j={id:q.jobId,stage:t.stage,serviceId:service.id,serviceName:service.name,status:'quoted',quote:serialize(q),providerSignature:signature,displayTotal:String(service.price/1000000),displayFee:String(Number(platformFee)/10**t.decimals)};
   await mutate(ownerId,s=>{const current=taskIn(s,t.id);if(current.stage!==t.stage||current.jobs.some((x:any)=>x.stage===t.stage))throw new DomainError('JOB_EXISTS','A quote already exists. Refresh the task.',409);current.jobs.push(j);current.status='quoted';});
   return{quote:serialize(q),providerSignature:signature,jobId:q.jobId};
 }
 if(action==='deliver'){
   const j=t.jobs.find((j:any)=>j.id===input.jobId);if(!j)throw new DomainError('NOT_FOUND','Job not found.',404);
   const chainJob=await vaultRead(t.vault,'jobs',[j.id]);if(chainJob[0]!==t.id||Number(chainJob[7])!==1||Number(chainJob[4])<=now)throw new DomainError('NOT_RESERVED','This job is not reserved onchain or its delivery window has expired.');
   if(j.delivery&&Number(j.delivery.validUntil)>now+60)return j.delivery;
   const output=j.output||runService(j.serviceId,t),resultDigest=encode({salt:t.salt,output}),validUntil=BigInt(Math.min(now+1800,Number(chainJob[4])));
   const signature=await attestor.signTypedData(deliveryTypedData(4663,t.vault,j.id,resultDigest,validUntil) as any),delivery={resultDigest,validUntil:validUntil.toString(),signature};
   await mutate(ownerId,s=>{const task=taskIn(s,t.id);const job=task.jobs.find((x:any)=>x.id===j.id);job.status='reserved';job.output=output;job.delivery=delivery;});return delivery;
 }
 if(action==='cancel'){
   const job=t.jobs.find((j:any)=>j.id===input.jobId);if(!job)throw new DomainError('NOT_FOUND','Job not found.',404);const chainJob=await vaultRead(t.vault,'jobs',[job.id]);if(chainJob[0]!==t.id||Number(chainJob[7])!==1)throw new DomainError('NOT_RESERVED','Only a currently reserved job can be cancelled.');const validUntil=BigInt(now+900);return{validUntil:validUntil.toString(),signature:await attestor.signTypedData(cancellationTypedData(4663,t.vault,job.id,validUntil) as any)};
 }
 if(action==='finalize'){
   const j=t.jobs.find((j:any)=>j.id===input.jobId);if(!j)throw new DomainError('NOT_FOUND','Job not found.',404);
   const chainJob=await vaultRead(t.vault,'jobs',[j.id]);if(chainJob[0]!==t.id||Number(chainJob[7])!==2)throw new DomainError('NOT_SETTLED','Wait for the settlement transaction to be included.');
   if(!j.output||!j.delivery)throw new DomainError('DELIVERY_MISSING','No delivery record is available.');
   if(!/^0x[a-fA-F0-9]{64}$/.test(input.settlementHash||''))throw new DomainError('INVALID_HASH','A settlement transaction hash is required.');
   const receipt=await client().getTransactionReceipt({hash:input.settlementHash});
   if(receipt.status!=='success'||receipt.to?.toLowerCase()!==t.vault.toLowerCase())throw new DomainError('UNCONFIRMED','Settlement receipt does not match this vault.');
   const matching=receipt.logs.some(log=>{try{if(log.address.toLowerCase()!==t.vault.toLowerCase())return false;const decoded:any=decodeEventLog({abi:artifact.abi,data:log.data,topics:log.topics});return decoded.eventName==='JobFinished'&&decoded.args.jobId===j.id&&Number(decoded.args.status)===2&&decoded.args.resultDigest===j.delivery.resultDigest;}catch{return false;}});
   if(!matching)throw new DomainError('RECEIPT_MISMATCH','This transaction does not settle the expected job and result.');
   // Reconcile the immutable job state; do not trust a browser-reported success.
   const updated=await mutate(ownerId,s=>{const task=taskIn(s,t.id),job=task.jobs.find((x:any)=>x.id===j.id);if(job.status!=='settled'){if(task.stage!==j.stage)throw new DomainError('STAGE_CONFLICT','Task stage already advanced.',409);job.status='settled';job.settlementHash=input.settlementHash;task.output=job.output;delete job.output;task.stage++;task.status=task.stage===3?'completed':'ready';}return task;});
   return{task:serialize({...updated.result,documents:undefined,salt:undefined})};
 }
 throw new DomainError('INVALID_ACTION','Unknown live gateway action.');
}
