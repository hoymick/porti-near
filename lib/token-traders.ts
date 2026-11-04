import {get} from './token-chart';
import {nearAccountOK,nearHashOK} from './near-core.mjs';
import {DomainError} from './errors.mjs';
export function rankTraders(payload:any,contract:string,now=Date.now()) {
 if(!Array.isArray(payload?.data))throw new DomainError('TRADES_RESPONSE','Trade data format was not recognized.',502);
 const seen=new Set<string>(),wallets=new Map<string,any>();let skipped=0,oldest=now,newest=0,accepted=0;
 for(const row of payload.data.slice(0,300)){const a=row?.attributes,t=Date.parse(a?.block_timestamp),volume=Number(a?.volume_in_usd);const buy=a?.to_token_address===contract,sell=a?.from_token_address===contract;
 if(typeof row?.id!=='string'||seen.has(row.id))continue;seen.add(row.id);
 if(!nearAccountOK(a?.tx_from_address)||!nearHashOK(a?.tx_hash)||buy===sell||!Number.isFinite(t)||t>now+60000||t<now-86400000||!Number.isFinite(volume)||volume<=0||volume>1e12||a.is_anomalous===true){skipped++;continue;}
 const w=wallets.get(a.tx_from_address)||{account:a.tx_from_address,buyUsd:0,sellUsd:0,trades:0,hashes:[]};w[buy?'buyUsd':'sellUsd']+=volume;w.trades++;if(!w.hashes.includes(a.tx_hash)&&w.hashes.length<3)w.hashes.push(a.tx_hash);wallets.set(w.account,w);accepted++;oldest=Math.min(oldest,t);newest=Math.max(newest,t);
 }
 return {rows:[...wallets.values()].map(w=>({...w,volumeUsd:w.buyUsd+w.sellUsd})).sort((a,b)=>b.volumeUsd-a.volumeUsd).slice(0,20),accepted,skipped,oldest:accepted?oldest:null,newest:accepted?newest:null,returned:payload.data.length};
}
const cache=new Map<string,{at:number,result:any}>();
export async function tokenTraders(contract:string){
 if(!nearAccountOK(contract))throw new DomainError('INVALID_TOKEN','Use an exact NEAR token contract.');
 const prior=cache.get(contract);if(prior&&Date.now()-prior.at<60000)return prior.result;
 const pools=await get(`/networks/near/tokens/${encodeURIComponent(contract)}/pools?page=1`);
 const pool=(Array.isArray(pools.data)?pools.data:[]).filter((p:any)=>p.id?.startsWith('near_')&&['base_token','quote_token'].some(k=>p.relationships?.[k]?.data?.id==='near_'+contract)&&Number(p.attributes?.reserve_in_usd)>0).sort((a:any,b:any)=>Number(b.attributes.reserve_in_usd)-Number(a.attributes.reserve_in_usd))[0];
 if(!pool)throw new DomainError('NO_MARKET','No covered NEAR trading pool was returned for this token.',404);
 const address=pool.id.slice(5),raw=await get(`/networks/near/pools/${encodeURIComponent(address)}/trades`),result={...rankTraders(raw,contract),contract,pool:address,checkedAt:Date.now(),source:'GeckoTerminal',url:'https://www.geckoterminal.com/near/pools/'+encodeURIComponent(address),coverage:'One pool, selected by reported reserves. Most recent returned swaps within 24 hours; not complete 24-hour volume or all-market activity. Routers and automated accounts may be included. Buy/sell direction follows the exact token leg; volume is provider-reported USD, not profit.'};
 if(cache.size>=32)cache.delete(cache.keys().next().value!);cache.set(contract,{at:Date.now(),result});return result;
}
