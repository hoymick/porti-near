import {nearAccountOK,units} from './near-core.mjs';
/** @param {string} message @param {{wallet?:string,roles?:any,imageId?:string}} options */
export function stakeChatIntent(message,{wallet,roles={},imageId}={}){
 if(imageId||typeof message!=='string'||/\b(?:cancel|stop|never|do not|don't|dont|unstake)\b/i.test(message))return null;
 let text=message.toLowerCase().trim().replace(/[.!?]+$/,'').replace(/^(?:can you|could you)\s+/,'');
 const prefix=text.match(/^(?:please\s+)?(?:in|from|using)\s+(?:my\s+)?(main|agent|device)\s+wallet[, ]+(stake\s+.+)$/);
 let role=prefix?.[1],body=prefix?.[2]||text;
 const suffix=body.match(/\s+(?:from|in|using)\s+(?:my\s+)?(main|agent|device)\s+wallet$/);
 if(suffix){if(role&&role!==suffix[1])return {error:'Choose one source wallet for this staking review.'};role=suffix[1];body=body.slice(0,suffix.index);}
 const match=body.match(/^(?:please\s+)?stake\s+(\d+(?:\.\d+)?)\s+(?:native\s+)?near(?:\s+(?:with|on|via|in)\s+meta\s*pool)?$/);
 if(!match)return null;
 let raw;try{raw=units(match[1],24)}catch{return {error:'Enter an exact staking amount in the supported 1–100 NEAR range.'}}
 if(BigInt(raw)<10n**24n||BigInt(raw)>100n*10n**24n)return {error:'Meta Pool staking in Porti supports 1–100 NEAR per review. Your requested amount was not changed. Nothing was signed or sent.'};
 role=role==='device'?'agent':role;
 const sender=role?roles[role]?.account:wallet;
 if(!nearAccountOK(sender)||!Object.values(roles).some(w=>w?.account===sender&&w?.verifiedAt))return {error:'Connect and verify the source wallet first, then repeat the staking request. Nothing was signed or sent.'};
 return {sender,amount:match[1]};
}
