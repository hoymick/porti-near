'use client';
import {useMemo} from 'react';
import {tokenRisk,riskReportHtml} from '../lib/token-risk.mjs';
import TopTraders from './top-traders';
import './top-traders.css';
export default function TokenRiskPanel({snapshot,sample}: {snapshot:any;sample:boolean;onInvestigate:(a:string)=>void;onWatchWallet:(a:string,l:string)=>void}){
 const risk=useMemo(()=>tokenRisk(snapshot),[snapshot]);
 function exportHtml(){const url=URL.createObjectURL(new Blob([riskReportHtml(snapshot,sample)],{type:'text/html;charset=utf-8'}));const a=document.createElement('a');a.href=url;a.download='Porti_Rug_Guard.html';a.click();setTimeout(()=>URL.revokeObjectURL(url),1000)}
 return <section className="risk-panel" aria-label="Top traders and risk screening"><TopTraders contract={snapshot.address} sample={sample}/><div className={`risk-verdict ${risk.level}`}><div><span className="sc-eyebrow">RUG GUARD · AVAILABLE EVIDENCE</span><h3>{risk.label}</h3><p>{risk.summary}</p></div></div><div className="porti-traders"><h3>Risk checks</h3>{risk.observations.length>0&&<section aria-label="Read-only research evidence"><h4>Read-only research evidence</h4>{risk.observations.map((x:string)=><p key={x}>{x}</p>)}</section>}{snapshot.warnings?.map((w:string,i:number)=><p key={i}>{w}</p>)}{risk.flags.map((f:any)=><article key={f.id}><h4>{f.title}</h4><p>{f.detail}</p></article>)}{!risk.flags.length&&<p>Insufficient evidence for a safety verdict. Missing holder data does not mean low risk.</p>}<h4>Checks still unavailable</h4>{risk.unknowns.map((x:string)=><p key={x}>{x}</p>)}<button className="secondary" onClick={exportHtml}>Download available risk evidence</button></div></section>
}


