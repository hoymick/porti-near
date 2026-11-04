export const quoteTypes = { Quote: [
  {name:'jobId',type:'bytes32'},{name:'taskId',type:'bytes32'},{name:'serviceId',type:'bytes32'},
  {name:'requestDigest',type:'bytes32'},{name:'agent',type:'address'},{name:'payout',type:'address'},
  {name:'agentVersion',type:'uint256'},{name:'providerAmount',type:'uint256'},{name:'platformFee',type:'uint256'},
  {name:'expiresAt',type:'uint256'},{name:'deliveryDeadline',type:'uint256'},
] };
export function quoteTypedData(chainId, vaultAddress, quote) {
  return {domain:{name:'WIF PORT',version:'1',chainId,verifyingContract:vaultAddress},types:quoteTypes,primaryType:'Quote',message:quote};
}
export function deliveryTypedData(chainId,vaultAddress,jobId,resultDigest,validUntil){
  return{domain:{name:'WIF PORT',version:'1',chainId,verifyingContract:vaultAddress},types:{Delivery:[{name:'jobId',type:'bytes32'},{name:'resultDigest',type:'bytes32'},{name:'validUntil',type:'uint256'}]},primaryType:'Delivery',message:{jobId,resultDigest,validUntil}};
}
export function cancellationTypedData(chainId,vaultAddress,jobId,validUntil){return{domain:{name:'WIF PORT',version:'1',chainId,verifyingContract:vaultAddress},types:{Cancellation:[{name:'jobId',type:'bytes32'},{name:'validUntil',type:'uint256'}]},primaryType:'Cancellation',message:{jobId,validUntil}};}
