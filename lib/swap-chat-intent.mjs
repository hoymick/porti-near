import {nearAccountOK} from './near-core.mjs';
/** @param {string} message @param {{wallet?:string,roles?:any,imageId?:string}} options */
export function swapChatIntent(message,{wallet,roles={},imageId}={}){
 if(imageId||/\b(?:cancel|stop|never|do not|don't|dont)\b/i.test(message))return null;
 const text=message.toLowerCase().trim().replace(/[.!?]+$/,'');
 const prefix=text.match(/^(?:please\s+)?(?:in|from|using)\s+(?:my\s+)?(main|agent|device)\s+wallet[, ]+((?:buy|swap|exchange)\s+.+)$/);
 let role=prefix?.[1],body=prefix?.[2]||text;
 const suffix=body.match(/\s+(?:from|in|using)\s+(?:my\s+)?(main|agent|device)\s+wallet$/);
 if(suffix){if(role&&role!==suffix[1])return null;role=suffix[1];body=body.slice(0,suffix.index);}
 const match=body.match(/^(?:please\s+)?(?:buy|swap|exchange)\s+(\d+(?:\.\d+)?)\s+(?:native\s+)?near\s+(?:(?:worth\s+)?of|for|to|into)\s+(?:(?:this|the)\s+)?([a-z0-9._-]+\.near)$/);
 if(!match||!nearAccountOK(match[2]))return null;
 role=role==='device'?'agent':role;
 const sender=role?roles[role]?.account:wallet;
 if(!nearAccountOK(sender)||(role&&!roles[role]?.verifiedAt))return {error:'Link and verify the requested source wallet first. No swap was prepared.'};
 return {sender,contract:match[2],amount:match[1],slippage:50};
}
