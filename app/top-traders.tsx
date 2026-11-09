'use client';
import {useEffect,useState} from 'react';
const snapshots = new Map<string, any>();
const snapshotMaxAge = 15 * 60 * 1000;

export default function TopTraders({contract,sample}:{contract:string;sample:boolean}){
 const [data,setData]=useState<any>(null),[error,setError]=useState(''),[busy,setBusy]=useState(false),[refresh,setRefresh]=useState(0);
 useEffect(() => {
   let live = true;
   setData(null);
   setError('');
   setBusy(!sample);
   if (sample) return;

   async function loadTraders() {
     let canUseSnapshot = true;
     try {
       const response = await fetch('/api/porti/traders?contract=' + encodeURIComponent(contract), {cache:'no-store'});
       canUseSnapshot = [429, 502, 503, 504].includes(response.status);
       const result = await response.json();
       if (!response.ok) throw new Error(result.error?.message || 'Trade provider unavailable');
       if (!result.stale) {
         snapshots.delete(contract);
         if (snapshots.size >= 32) snapshots.delete(snapshots.keys().next().value!);
         snapshots.set(contract, result);
       }
       if (live) setData(result);
     } catch (error) {
       if (!live) return;
       const prior = snapshots.get(contract);
       if (canUseSnapshot && prior && Date.now() - prior.checkedAt < snapshotMaxAge) {
         setData({...prior, stale:true});
       } else {
         setError(error instanceof Error ? error.message : 'Trade provider unavailable');
       }
     } finally {
       if (live) setBusy(false);
     }
   }
   void loadTraders();
   return () => { live = false; };
 }, [contract, sample, refresh]);
 const usd=(v:number)=>v.toLocaleString(undefined,{style:'currency',currency:'USD',maximumFractionDigits:2});
 return <section className="porti-traders"><div className="risk-map-heading"><div><h3>Top Traders</h3><p>Ranked by observed buy + sell USD volume, not wallet balance or profit.</p></div><button className="secondary" disabled={busy||sample} onClick={()=>setRefresh(v=>v+1)}>Refresh traders</button></div>{sample?<p>Switch to Live for actual trader rankings. Holder fixtures are not used as traders.</p>:busy?<p role="status">Reading recent swaps…</p>:error?<p role="alert">Trader data unavailable: {error}</p>:data&&<>{data.stale&&<p role="status">The live trader feed is temporarily unavailable. Showing the last successful sample.</p>}<p>{data.accepted} accepted swaps · {data.skipped} unsupported/anomalous entries excluded · checked {new Date(data.checkedAt).toLocaleString()}</p>{data.oldest&&<p>Observed range: {new Date(data.oldest).toLocaleString()} – {new Date(data.newest).toLocaleString()}</p>}<div className="trader-table-wrap"><table><thead><tr><th>Rank / account</th><th>Buys</th><th>Sells</th><th>Total volume</th><th>Swaps</th><th>Evidence</th></tr></thead><tbody>{data.rows.map((w:any,i:number)=><tr key={w.account}><td>#{i+1} <a href={'https://nearblocks.io/address/'+w.account} target="_blank" rel="noreferrer">{w.account}</a></td><td>{usd(w.buyUsd)}</td><td>{usd(w.sellUsd)}</td><td>{usd(w.volumeUsd)}</td><td>{w.trades}</td><td>{w.hashes.map((h:string,j:number)=><a key={h} href={'https://nearblocks.io/txns/'+h} target="_blank" rel="noreferrer">Tx {j+1} </a>)}</td></tr>)}</tbody></table></div>{!data.rows.length&&<p>No supported NEAR trader records in the returned sample. This does not mean the token has no trading activity.</p>}<p>{data.coverage}</p><a href={data.url} target="_blank" rel="noreferrer">Source pool on GeckoTerminal ↗</a></>}</section>
}
