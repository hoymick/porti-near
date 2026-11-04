import {env} from 'cloudflare:workers';
import {readWorkspace,mutate} from './workspace';
import {nearRpc,viewAccount,viewFunction,initialPorti} from './near-services';
import {nearAccountOK,nearHashOK,units,decimal} from './near-core.mjs';
import {DomainError} from './errors.mjs';
import {runPortiApp} from './porti-apps';
export const STAKE_CONTRACT='meta-pool.near';
export const STAKE_GAS='100000000000000';
export function stakeTransaction(sender:string,raw:string){return {signerId:sender,receiverId:STAKE_CONTRACT,actions:[{type:'FunctionCall',params:{methodName:'deposit_and_stake',args:{},gas:STAKE_GAS,deposit:raw}}]};}
export function stakeEvidence(r:any,d:any,hash:string){
 const tx=r?.transaction,a=tx?.actions?.[0]?.FunctionCall,receipts=r?.receipts_outcome;
 if(r?.final_execution_status!=='FINAL'||tx?.hash!==hash||r.transaction_outcome?.id!==hash||tx.signer_id!==d.sender||tx.receiver_id!==STAKE_CONTRACT||tx.actions?.length!==1||a?.method_name!=='deposit_and_stake'||a.deposit!==d.raw||String(a.gas)!==STAKE_GAS||typeof a.args!=='string'||!Array.isArray(receipts)||!receipts.length||receipts.length>500||typeof r.status?.SuccessValue!=='string')return null;
 try{const args=JSON.parse(atob(a.args));if(!args||Array.isArray(args)||Object.keys(args).length)return null}catch{return null}
 const ids=new Set(receipts.map((x:any)=>x.id));if(ids.size!==receipts.length||receipts.some((x:any)=>!nearHashOK(x.id)))return null;
 for(const x of [r.transaction_outcome,...receipts]){const o=x?.outcome,s=o?.status;if(!o||!Array.isArray(o.receipt_ids)||o.receipt_ids.some((v:string)=>!ids.has(v))||!s||Object.keys(s).length!==1||!((typeof s.SuccessValue==='string')||(typeof s.SuccessReceiptId==='string'&&ids.has(s.SuccessReceiptId))))return null;}
 let minted=BigInt("0");
 for(const receipt of receipts){if(receipt.outcome?.executor_id!==STAKE_CONTRACT)continue;for(const line of receipt.outcome.logs||[]){if(typeof line!=='string'||line.length>20000||!line.startsWith('EVENT_JSON:'))continue;try{const e=JSON.parse(line.slice(11));if(e.standard==='nep141'&&e.event==='ft_mint'&&Array.isArray(e.data))for(const x of e.data)if(x.owner_id===d.sender&&typeof x.amount==='string'&&/^\d+$/.test(x.amount))minted+=BigInt(x.amount)}catch{}}}
 return minted>BigInt("0")?minted.toString():null;
}
async function available(id:string,sender:string,raw:string){const account=await viewAccount(id,sender),q=await nearRpc(id,'gas_price',[account.block_hash]);if(!/^\d+$/.test(q.gas_price))throw new DomainError('GAS_UNAVAILABLE','Network fee could not be verified.');const reserve=BigInt(q.gas_price)*BigInt("300000000000000")+BigInt("20000000000000000000000");if(BigInt(account.amount)-BigInt(account.storage_usage||0)*BigInt("10000000000000000000")-reserve<BigInt(raw))throw new DomainError('INSUFFICIENT_NEAR','Not enough available NEAR after account storage and the buffered network fee reserve.');return reserve.toString();}
export async function stakingState(id:string){return {drafts:(await readWorkspace(id)).state.porti?.stakeDrafts||[]};}
export async function stakingAction(id:string,input:any){
 const db=env.DB;if(!db)throw new DomainError("STORAGE_UNAVAILABLE","Staking storage unavailable.",503);
 if(input.action==='prepare'){
  const p=(await readWorkspace(id)).state.porti||initialPorti();if(!nearAccountOK(input.sender)||!Object.values(p.walletRoles||{}).some((w:any)=>w.account===input.sender))throw new DomainError('WALLET_REQUIRED','Connect and verify your main or agent wallet first.');
  let raw:string;try{raw=units(input.amount,24)}catch{throw new DomainError('STAKE_AMOUNT','Enter an exact NEAR amount.');}
  if(BigInt(raw)<BigInt("1000000000000000000000000")||BigInt(raw)>BigInt("100000000000000000000000000"))throw new DomainError('STAKE_LIMIT','Stake between 1 and 100 NEAR per review.');
  const reserve=await available(id,input.sender,raw),contract=await viewAccount(id,STAKE_CONTRACT),state=await runPortiApp(id,'meta-pool','read-state',{}),price=BigInt(state.data.stNearPriceYocto);if(price<=BigInt("0"))throw new DomainError('RATE_UNAVAILABLE','Staking reference rate unavailable.');
  const d={id:crypto.randomUUID(),sender:input.sender,raw,amount:decimal(raw,24),reserve,estimatedStNear:decimal(BigInt(raw)*BigInt("1000000000000000000000000")/price,24),codeHash:contract.code_hash,createdAt:Date.now(),expiresAt:Date.now()+120000,status:'review',transaction:stakeTransaction(input.sender,raw)};
  await mutate(id,s=>{s.porti??=initialPorti();const ds=s.porti.stakeDrafts||[];if(ds.some((x:any)=>x.sender===input.sender&&['wallet_requested','submitted'].includes(x.status)))throw new DomainError('STAKE_PENDING','A staking review is awaiting a result. Verify its original hash before preparing another stake.');s.porti.stakeDrafts=[...ds.slice(-19),d]});return {draft:d};
 }
 const p=(await readWorkspace(id)).state.porti,d=p?.stakeDrafts?.find((x:any)=>x.id===input.draftId);if(!d)throw new DomainError('STAKE_REVIEW','Staking review not found.');
 if(input.action==='approve'){
  if(d.status!=='review'||d.expiresAt<Date.now())throw new DomainError('STAKE_EXPIRED','This review expired or was already requested. Prepare a fresh review.');
  if(!Object.values(p.walletRoles||{}).some((w:any)=>w.account===d.sender))throw new DomainError('WALLET_REQUIRED','Reconnect and verify the reviewed wallet.');
  const contract=await viewAccount(id,STAKE_CONTRACT);if(contract.code_hash!==d.codeHash)throw new DomainError('CONTRACT_CHANGED','Meta Pool contract changed. Prepare a fresh review.');
  const reserve=await available(id,d.sender,d.raw);
  await mutate(id,s=>{const x=s.porti.stakeDrafts.find((x:any)=>x.id===d.id);if(x.status!=='review'||x.expiresAt<Date.now()||s.porti.stakeDrafts.some((v:any)=>v.id!==d.id&&v.sender===d.sender&&['wallet_requested','submitted'].includes(v.status)))throw new DomainError('STAKE_ALREADY_REQUESTED','A staking approval was already requested. Check its outcome.');x.status='wallet_requested';x.requestedAt=Date.now();});return {draft:{...d,reserve,status:'wallet_requested',transaction:stakeTransaction(d.sender,d.raw)}};
 }
 if(input.action!=='verify'||!nearHashOK(input.hash)||!['wallet_requested','submitted','finalized'].includes(d.status))throw new DomainError('STAKE_VERIFY','Use the original transaction hash after requesting wallet approval.');
 if(d.hash&&d.hash!==input.hash)throw new DomainError('STAKE_HASH','This review is bound to another transaction hash.');
 await mutate(id,s=>{const x=s.porti.stakeDrafts.find((x:any)=>x.id===d.id);if(x.hash&&x.hash!==input.hash)throw new DomainError('STAKE_HASH','A different hash is already linked.');x.hash=input.hash;if(x.status!=='finalized')x.status='submitted'});
 const existing:any=await db.prepare('SELECT draft_id,receipt FROM porti_transfer_receipts WHERE owner_id=? AND hash=?').bind(id,input.hash).first();if(existing){if(existing.draft_id!==d.id)throw new DomainError('HASH_USED','Hash already belongs to another review.');return {receipt:JSON.parse(existing.receipt)}}
 const result=await nearRpc(id,'tx',{tx_hash:input.hash,sender_account_id:d.sender,wait_until:'FINAL'}),minted=stakeEvidence(result,d,input.hash);if(!minted)throw new DomainError('STAKE_UNVERIFIED','Staking is not yet verified. Keep this hash and check again; do not submit another stake.');
 const block=await nearRpc(id,'block',{block_id:result.transaction_outcome.block_hash}),time=Number(BigInt(block?.header?.timestamp_nanosec||block?.header?.timestamp||'0')/BigInt("1000000"));if(!Number.isSafeInteger(time)||time<d.requestedAt-30000||time>Date.now()+30000)throw new DomainError('STAKE_TIME','Transaction is outside this review’s submission window.');
 const receipt={type:'staking',draftId:d.id,hash:input.hash,sender:d.sender,recipient:STAKE_CONTRACT,amount:d.amount,symbol:'NEAR',token:'near',stNear:decimal(minted,24),network:'mainnet',status:'finalized',verifiedAt:Date.now(),blockHash:result.transaction_outcome.block_hash};
 await db.prepare('INSERT INTO porti_transfer_receipts(id,owner_id,hash,draft_id,receipt,created_at) VALUES(?,?,?,?,?,?) ON CONFLICT(owner_id,hash) DO NOTHING').bind(crypto.randomUUID(),id,input.hash,d.id,JSON.stringify(receipt),Date.now()).run();
 const stored:any=await db.prepare('SELECT draft_id,receipt FROM porti_transfer_receipts WHERE owner_id=? AND hash=?').bind(id,input.hash).first();if(stored?.draft_id!==d.id)throw new DomainError('HASH_USED','Hash belongs to another review.');
 await mutate(id,s=>{const x=s.porti.stakeDrafts.find((x:any)=>x.id===d.id);if(x.hash!==input.hash)throw new DomainError('STAKE_HASH','Hash mismatch.');x.status='finalized';x.receipt=receipt});return {receipt};
}
