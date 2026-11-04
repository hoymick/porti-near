import {nearAccountOK} from './near-core.mjs';
import {candles,reading} from './chart-core.mjs';
import {DomainError} from './errors.mjs';
const cache=new Map<string,{at:number,data:any}>();
async function get(path:string){const r=await fetch('https://api.geckoterminal.com/api/v2'+path,{headers:{Accept:'application/json'},redirect:'error',signal:AbortSignal.timeout(12000)});if(!r.ok)throw new DomainError('CHART_UNAVAILABLE',`Market data returned HTTP ${r.status}. No chart reading was produced.`,503);return r.json() as Promise<any>;}
export async function tokenChart(contract:string,frame='1h'){
 if(!nearAccountOK(contract)||!['15m','1h','4h'].includes(frame))throw new DomainError('CHART_INPUT','Use an exact NEAR token contract and supported timeframe.');const key=contract+':'+frame,prior=cache.get(key);if(prior&&Date.now()-prior.at<120000)return prior.data;
 const pools=await get(`/networks/near/tokens/${encodeURIComponent(contract)}/pools?page=1`);const matches=(p:any)=>['base_token','quote_token'].find(k=>p.relationships?.[k]?.data?.id==='near_'+contract);
 const pool=(pools.data||[]).filter((p:any)=>p.id?.startsWith('near_')&&matches(p)&&Number(p.attributes?.reserve_in_usd)>0).sort((a:any,b:any)=>Number(b.attributes.reserve_in_usd)-Number(a.attributes.reserve_in_usd))[0];if(!pool)throw new DomainError('NO_MARKET','No covered NEAR pool was returned for this contract.',404);
 const seconds=frame==='15m'?900:frame==='1h'?3600:14400,unit=frame==='15m'?'minute':'hour',aggregate=frame==='15m'?15:frame==='4h'?4:1,side=matches(pool)==='base_token'?'base':'quote';
 const raw=await get(`/networks/near/pools/${encodeURIComponent(pool.id.slice(5))}/ohlcv/${unit}?aggregate=${aggregate}&limit=200&currency=usd&token=${side}&include_empty_intervals=false`),rows=candles(raw.data?.attributes?.ohlcv_list,seconds);if(rows.length<2)throw new DomainError('NO_CANDLES','Too few completed candles to read this market.',404);
 const data={contract,frame,seconds,pool:pool.id.slice(5),name:String(pool.attributes.name||'NEAR market').slice(0,120),rows,reading:reading(rows),fetchedAt:Date.now(),stale:Date.now()/1000-rows.at(-1)[0]>seconds*3,gaps:rows.some((r:any,i:number)=>i&&r[0]-rows[i-1][0]>seconds*1.5),source:'GeckoTerminal',url:'https://www.geckoterminal.com/near/pools/'+encodeURIComponent(pool.id.slice(5))};if(cache.size>=32)cache.delete(cache.keys().next().value!);cache.set(key,{at:Date.now(),data});return data;
}
