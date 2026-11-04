import {securityChanges} from './risk-changes.mjs';
import {keccak256,toHex} from 'viem';
export const EXPLORER='https://robinhoodchain.blockscout.com';
export const WIF='0x5173b8eA6923c2d40267890D45C46a3480954773';
export const addressOK=a=>typeof a==='string'&&/^0x[0-9a-fA-F]{40}$/.test(a)&&!/^0x0{40}$/i.test(a);
export const lower=a=>(typeof a==='string'?a:a?.hash||'').toLowerCase();
const ZERO='0x0000000000000000000000000000000000000000';
const swapSignatures=['Swap(address,uint256,uint256,uint256,uint256,address)','Swap(address,address,int256,int256,uint160,uint128,int24)','Swap(bytes32,address,int128,int128,uint160,uint128,int24,uint24)'];
const swapTopics=swapSignatures.map(s=>keccak256(toHex(s)));
export function normalizedTransfer(t){return{id:`${t.transaction_hash}:${t.log_index??t.block_number??0}:${lower(t.token?.address_hash)}`,hash:t.transaction_hash,from:lower(t.from),to:lower(t.to),token:lower(t.token?.address_hash),symbol:String(t.token?.symbol||'Unknown').slice(0,20),name:String(t.token?.name||'Unknown token').slice(0,100),raw:String(t.total?.value||'0'),decimals:Number(t.total?.decimals??t.token?.decimals??0),timestamp:t.timestamp,block:t.block_number};}
export function formatAmount(raw,decimals=18){try{const n=BigInt(raw),sign=n<0n?'-':'',abs=n<0n?-n:n,d=Math.min(36,Math.max(0,Number(decimals)||0)),s=abs.toString().padStart(d+1,'0');const fraction=d?s.slice(-d).slice(0,5).replace(/0+$/,''):'';return sign+s.slice(0,s.length-d)+(fraction?'.'+fraction:'');}catch{return 'Unknown';}}
// A transfer is never a buy. A swap event plus opposing wallet token flows is an inference,
// not proof that the pool is legitimate, the route is liquid, or the asset is safe.
export function classifySwap(wallet,transfers,logs,tx,complete=true){
 const net=new Map(),w=lower(wallet);for(const t of transfers){if(!t.token||t.from===t.to)continue;let value;try{value=BigInt(t.raw);}catch{continue;}const direction=(t.to===w?1n:0n)-(t.from===w?1n:0n);if(direction)net.set(t.token,{...t,net:(net.get(t.token)?.net||0n)+value*direction});}
 const inbound=[...net.values()].filter(t=>t.net>0n),outbound=[...net.values()].filter(t=>t.net<0n);
 const swap=logs.some(l=>swapTopics.includes(String(l.topics?.[0]||'').toLowerCase()));
 if(complete&&lower(tx?.from)===w&&tx?.status==='ok'&&swap&&inbound.length===1&&outbound.length===1)return{kind:'swap',label:'Swap inferred',acquired:inbound[0].symbol,acquiredToken:inbound[0].token,disposed:outbound[0].symbol,disposedToken:outbound[0].token,evidence:['Successful transaction initiated by this wallet.','Decoded Swap event in this transaction.','One net token inflow and one net token outflow.'],caveat:'Event-based inference. Pool authenticity and route are not independently verified.'};
 return{kind:'transfer',label:swap?'Complex swap / unresolved':'Transfer · not a verified buy',evidence:[...new Set(transfers.map(t=>t.to===w?'Incoming token transfer.':'Outgoing token transfer.'))],caveat:complete?'No unambiguous swap classification. Native ETH routes and multi-asset routes may remain unresolved.':'Transaction details are incomplete; swap classification withheld.'};
}
export function concentration(token,holders){if(!Array.isArray(holders)||!holders.length)return null;let supply;try{supply=BigInt(token.total_supply||0);}catch{return null;}if(supply<=0n)return null;let sum=0n;for(const h of holders.slice(0,10)){try{sum+=BigInt(h.value||0);}catch{}}return Math.min(100,Number(sum*10000n/supply)/100);}
export function tokenSignals(token,transfers,holders,now=Date.now()){
 const hour=transfers.filter(t=>Date.parse(t.timestamp)>now-3600000&&Date.parse(t.timestamp)<=now),recent=hour.filter(t=>Date.parse(t.timestamp)>now-900000),prior=hour.filter(t=>Date.parse(t.timestamp)<=now-900000);
 const recipients=new Set(recent.filter(t=>t.to!==ZERO&&t.from!==t.to).map(t=>t.to));
 const top10=concentration(token,holders);return{transfers15m:recent.length,transfers1h:hour.length,recipients15m:recipients.size,prior15mEquivalent:prior.length/3,pace:prior.length?Math.round(recent.length/(prior.length/3)*10)/10:null,top10,coveredFrom:transfers.length?transfers.at(-1)?.timestamp:null,sampleSize:transfers.length,notes:[`Observed ${recent.length} transfers and ${recipients.size} recipient addresses in 15 minutes. Recipients are not unique buyers.`,...(top10===null?['Supply unavailable; concentration cannot be calculated.']:[`Largest 10 holder entries own ${top10}% of reported total supply. Includes pools, contracts and burn addresses.`]),'Only the newest indexed page is analyzed. A busy token can have incomplete time-window coverage.','Volume, liquidity, profitable-wallet rankings and common-funder attribution are not established by these transfer counts.']};
}
export function mergeSnapshot(scout,snapshot,now=Date.now()){
 const key=`${snapshot.kind}:${snapshot.address.toLowerCase()}`,previous=scout.snapshots?.[key];scout.snapshots??={};scout.alerts??=[];
 if(previous){const old=new Set(previous.transfers.map(t=>t.id));const newer=snapshot.transfers.filter(t=>!old.has(t.id)&&Date.parse(t.timestamp)>=Math.min(...previous.transfers.map(x=>Date.parse(x.timestamp)).filter(Number.isFinite),previous.checkedAt));
 for(const t of newer.slice(0,20)){const classification=snapshot.activity?.find(a=>a.hash===t.hash)?.classification;const label=classification?.kind==='swap'?`Swap inferred: acquired ${classification.acquired}`:`${snapshot.kind==='wallet'&&t.to===snapshot.address.toLowerCase()?'Incoming':'Token'} ${t.symbol} transfer`;const id=`${key}:${t.id}`;if(!scout.alerts.some(a=>a.id===id))scout.alerts.unshift({id,address:snapshot.address,kind:snapshot.kind,label,hash:t.hash,token:t.token,timestamp:t.timestamp,createdAt:now,read:false});}
 if(Number.isFinite(previous.signals?.top10)&&Number.isFinite(snapshot.signals?.top10)&&snapshot.signals?.top10-previous.signals?.top10>=5){const id=`${key}:concentration:${now}`;scout.alerts.unshift({id,address:snapshot.address,kind:snapshot.kind,label:'Top-10 concentration rose by at least 5 percentage points',createdAt:now,read:false});}
 }
 for(const change of securityChanges(previous,snapshot)){const id=`${key}:${change.code}:${change.relatedAddress}:${change.hash||snapshot.checkedAt}`;if(!scout.alerts.some(a=>a.id===id))scout.alerts.unshift({id,address:snapshot.address,kind:snapshot.kind,...change,createdAt:now,read:false});}
 if(snapshot.risk?.level==='high'&&previous?.risk?.level!=='high'){const id=`${key}:risk:${now}`;scout.alerts.unshift({id,address:snapshot.address,kind:snapshot.kind,label:'High risk signals: holder concentration needs review',createdAt:now,read:false});}
 scout.snapshots[key]=snapshot;scout.alerts=scout.alerts.slice(0,100);return previous?'updated':'baseline';
}
export function newScout(){return{watches:[],snapshots:{},alerts:[],rules:{interval:300,incoming:true,outgoing:true},lastRefresh:0};}
