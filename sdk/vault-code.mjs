import {keccak256} from 'viem';
/** Compare compiled runtime after zeroing only compiler-declared immutable slots. */
export function matchesVaultCode(code,artifact){
 if(!code||!artifact.runtime||code.length!==artifact.runtime.length)return false;
 let normalized=code.slice(2).toLowerCase(),expected=artifact.runtime.slice(2).toLowerCase();
 for(const slots of Object.values(artifact.immutableReferences||{}))for(const slot of slots){const start=slot.start*2,length=slot.length*2;normalized=normalized.slice(0,start)+'0'.repeat(length)+normalized.slice(start+length);expected=expected.slice(0,start)+'0'.repeat(length)+expected.slice(start+length);}
 return keccak256('0x'+normalized)===keccak256('0x'+expected);
}
