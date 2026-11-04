import {env} from 'cloudflare:workers';
import {readWorkspace} from './workspace';
import {DomainError} from './errors.mjs';
const config=env as unknown as Record<string,string>;
export function fundingStatus(){return {moonpayConfigured:!!(config.MOONPAY_PUBLIC_KEY&&config.MOONPAY_SECRET_KEY&&config.PORTI_MOONPAY_IP_HEADER&&config.PORTI_MOONPAY_LIVE_ENABLED==='true'),provider:'MoonPay',currency:'NEAR',network:'mainnet',notice:'Payment methods, country eligibility, fees and verification are determined by MoonPay. Porti never collects card numbers. A return URL or opened checkout is not payment confirmation.'}}
export function buyAmount(input:unknown){if(typeof input!=='string'||!/^\d{1,5}(\.\d{1,2})?$/.test(input)||Number(input)<20||Number(input)>10000)throw new DomainError('BUY_AMOUNT','Choose a USD budget between $20 and $10,000. Provider limits may differ.');return input;}
async function hmac(value:string,key:string){const k=await crypto.subtle.importKey('raw',new TextEncoder().encode(key),{name:'HMAC',hash:'SHA-256'},false,['sign']);return btoa(String.fromCharCode(...new Uint8Array(await crypto.subtle.sign('HMAC',k,new TextEncoder().encode(value)))));}
export async function preparePurchase(id:string,input:any,request:Request){
 const amount=buyAmount(input.amount);if(!['credit_debit_card','apple_pay'].includes(input.method))throw new DomainError('BUY_METHOD','Choose card or Apple Pay.');
 const p=(await readWorkspace(id)).state.porti;if(!Object.values(p?.walletRoles||{}).some((w:any)=>w.account===input.account))throw new DomainError('BUY_WALLET','Connect and verify the destination NEAR wallet first.');
 if(!fundingStatus().moonpayConfigured)throw new DomainError('BUY_SETUP','The embedded MoonPay integration needs owner configuration. Use MoonPay’s website for now; no payment was started here.',503);
 const ip=request.headers.get(config.PORTI_MOONPAY_IP_HEADER);if(!ip||ip.includes(',')||!/^[a-fA-F0-9:.]{3,64}$/.test(ip))throw new DomainError('BUY_IP','A trusted customer IP address could not be established. Checkout is unavailable.',503);
 const params=new URLSearchParams({apiKey:config.MOONPAY_PUBLIC_KEY,currencyCode:'near',baseCurrencyCode:'usd',baseCurrencyAmount:amount,walletAddress:input.account,paymentMethod:input.method,theme:'light',lockAmount:'true',allowedIpAddress:await hmac(ip,config.MOONPAY_SECRET_KEY)});
 const query='?'+params.toString();params.set('signature',await hmac(query,config.MOONPAY_SECRET_KEY));
 return {url:'https://buy.moonpay.com/?'+params.toString(),amount,account:input.account,method:input.method,status:'checkout_prepared',notice:fundingStatus().notice};
}
