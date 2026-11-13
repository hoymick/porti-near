import {nearAccountOK} from './near-core.mjs';
const raw=x=>typeof x==='string'&&/^\d+$/.test(x);
export function tokenRegistered(balance){return !!balance&&raw(balance.total)&&raw(balance.available)&&BigInt(balance.total)>=BigInt(balance.available);}
export function registrationEvidence(result,review,hash){
 if(!result||result.final_execution_status!=='FINAL')return 'pending';
 const tx=result.transaction,a=tx?.actions;
 if(tx?.hash!==hash||tx.signer_id!==review.sender||tx.receiver_id!==review.contract||!Array.isArray(a)||a.length!==1)return 'mismatch';
 const call=a[0].FunctionCall;
 if(!call||call.method_name!=='storage_deposit'||call.deposit!==review.storageRaw||String(call.gas)!=='30000000000000')return 'mismatch';
 try{const args=JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(call.args),c=>c.charCodeAt(0))));if(args.account_id!==review.sender||args.registration_only!==true)return 'mismatch';}catch{return 'mismatch';}
 if(result.status?.Failure||result.transaction_outcome?.outcome?.status?.Failure||(result.receipts_outcome||[]).some(r=>r.outcome?.status?.Failure))return 'failed';
 return result.status&&Object.hasOwn(result.status,'SuccessValue')&&nearAccountOK(review.sender)?'confirmed':'pending';
}
