export function swapProgress(order){
 const status=order?.providerStatus;
 if(status==='SUCCESS')return {terminal:true,tone:'success',message:'Swap complete — the routing provider reports success. Check the output transaction below.'};
 if(status==='REFUNDED')return {terminal:true,tone:'warning',message:'Swap refunded — the provider reports a refund. Check the original source-wallet transaction below.'};
 if(status==='FAILED')return {terminal:true,tone:'error',message:'Swap failed — check the original deposit and refund status before trying again.'};
 if(status==='INCOMPLETE_DEPOSIT')return {terminal:true,tone:'warning',message:'Swap needs attention — the provider reports an incomplete deposit. Check the original order; do not send again automatically.'};
 return {terminal:false,tone:'pending',message:status==='PROCESSING'?'Swap is processing. I’m checking this order automatically.':'Swap confirmation pending. I’m checking the original order; no new deposit will be requested.'};
}
export function uniqueTransactionCards(messages=[],extraDraft){
 const seen=new Set();
 const result=messages.map(m=>({...m,cards:[...(m.cards||[])]}));
 for(let i=result.length-1;i>=0;i--)result[i].cards=result[i].cards.filter(c=>{
  const key=c.type==='transfer'&&c.draft?.id?'transfer:'+c.draft.id:c.type==='swap-review'&&(c.order?.id||c.registration?.id||c.id)?'swap:'+(c.order?.id||c.registration?.id||c.id):null;
  if(!key)return true;if(seen.has(key))return false;seen.add(key);return true;
 });
 return {messages:result,extraDraft:extraDraft&&!seen.has('transfer:'+extraDraft.id)?extraDraft:null};
}
