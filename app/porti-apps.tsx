"use client";
import { useEffect, useRef, useState } from "react";
import { ArrowUpRight, Blocks, Check, Code2, Landmark, Pin, RefreshCw, Search, ShieldCheck, Users, Waves, X } from "lucide-react";
import { portiApps } from "../lib/porti-app-registry";
import { createPortiAppsClient, definePortiApp } from "../sdk/porti-apps";
const client = createPortiAppsClient();
const sampleManifest = JSON.stringify({schemaVersion:1,id:"my-near-app",name:"My NEAR App",version:"1.0.0",description:"Describe the read capability your project brings to Porti.",category:"Research",network:"mainnet",website:"https://example.com",permissions:["chain:read"],actions:[{id:"read-state",label:"Read project state",effect:"read"}]},null,2);
const inputs: Record<string,{label:string;placeholder:string;note:string}> = {
 "rhea-pools":{label:"Exchange pool ID",placeholder:"0",note:"Inspect one exchange pool. Reserves are raw token units, before decimal conversion."},
 "near-staking":{label:"Staking pool contract",placeholder:"validator.poolv1.near",note:"Read a standard staking pool. Fees apply to rewards; this view does not calculate APY."},
 "meta-pool":{label:"",placeholder:"",note:"Read the stNEAR reference value and exact token supply from meta-pool.near. This is a contract reference, not a trade quote or guaranteed redemption rate."},
 "near-social":{label:"NEAR account",placeholder:"mob.near",note:"Read the account’s public name and bio from SocialDB at social.near. A profile is self-published and does not verify identity."},
 "astro-dao":{label:"DAO contract",placeholder:"ref-finance.sputnik-dao.near",note:"Read the DAO configuration and up to five recent proposal slots from a Sputnik v2 contract. Deleted slots may be absent. No vote is submitted."},
};
function exactUnits(raw:string,decimals:number) { const s=raw.padStart(decimals+1,"0"); return decimals ? s.slice(0,-decimals)+"."+s.slice(-decimals).replace(/0+$/,"").padEnd(1,"0") : raw; }
function AppResult({result}:{result:any}) {
 const d=result.data;
 const row=(label:string,value:any)=><div key={label}><dt>{label}</dt><dd>{value}</dd></div>;
 return <div className="apps-result" aria-live="polite"><span className="apps-tag">Finalized mainnet read</span><p>Checked {new Date(result.checkedAt).toLocaleString()}</p><dl>
 {result.appId==="rhea-pools"&&<>{row("Pool / total pools",`${d.poolId} / ${d.totalPools}`)}{row("Pool type",d.poolKind)}{row("Pool fee",`${d.feeBps} basis points`)}{d.tokens.map((t:string,i:number)=>row(t,`${d.reservesRaw[i]} raw units`))}</>}
 {result.appId==="near-staking"&&<>{row("Total staked (NEAR)",exactUnits(d.totalStakedYocto,24))}{row("Delegators",d.delegators)}{row("Reward fee fraction",`${d.rewardFee.numerator} / ${d.rewardFee.denominator}`)}</>}
 {result.appId==="meta-pool"&&<>{row("Reference NEAR per stNEAR",exactUnits(d.stNearPriceYocto,24))}{row("stNEAR total supply",exactUnits(d.totalSupplyRaw,d.decimals))}{row("Contract","meta-pool.near")}</>}
 {result.appId==="near-social"&&<>{row("Account",d.account)}{row("Profile",d.found?"Public profile data returned":"No name or bio found in SocialDB")}{row("Published name",d.name||"Not published")}{row("Published bio",d.bio||"Not published")}</>}
 {result.appId==="astro-dao"&&<>{row("DAO",d.name)}{row("Purpose",d.purpose)}{row("Next proposal ID",d.nextProposalId)}</>}
 </dl>{result.appId==="astro-dao"&&<div className="apps-proposals"><h4>Recent proposals</h4>{d.proposals.length?d.proposals.map((p:any)=><article key={p.id}><span className="apps-tag">#{p.id} · {p.status}</span><p>{p.description||"No description supplied"}</p></article>):<p>No proposals returned in the latest five slots.</p>}</div>}
 <details><summary>View onchain evidence</summary>{result.evidence.map((e:any)=><p key={e.method}><strong>{e.method}</strong><br/>{e.contract} · Block {e.blockHeight}<br/><code>{e.blockHash}</code></p>)}</details><p>{result.notice}</p></div>;
}
export default function PortiApps({sample}: {sample:boolean}) {
 const [pinned,setPinned]=useState<string[]>([]),[search,setSearch]=useState(""),[category,setCategory]=useState("All"),[active,setActive]=useState(""),[input,setInput]=useState(""),[result,setResult]=useState<any>(null),[busy,setBusy]=useState(false),[error,setError]=useState(""),[developer,setDeveloper]=useState(false),[manifest,setManifest]=useState(sampleManifest),[validation,setValidation]=useState("");
 const panel=useRef<HTMLElement>(null);
 useEffect(()=>{let live=true;setResult(null);if(!sample)client.list().then(d=>{if(live)setPinned(d.pinned)}).catch(e=>{if(live)setError(e.message)});return()=>{live=false}},[sample]);
 useEffect(()=>{if(active)panel.current?.scrollIntoView({block:"start",behavior:"auto"})},[active]);
 const app=portiApps.find(a=>a.id===active),info=app?inputs[app.id]:null;
 const visible=[...portiApps].sort((a,b)=>Number(pinned.includes(b.id))-Number(pinned.includes(a.id))).filter(a=>(category==="All"||a.category===category)&&(a.name+" "+a.category).toLowerCase().includes(search.toLowerCase()));
 async function pin(id:string) {setBusy(true);setError("");try{const d=await client.pin(id,!pinned.includes(id));setPinned(d.pinned)}catch(e:any){setError(e.message)}finally{setBusy(false)}}
 async function run() {if(!app)return;setBusy(true);setError("");setResult(null);try{const args=app.id==="rhea-pools"?{poolId:Number(input)}:app.id==="near-staking"?{poolAccount:input.trim()}:app.id==="near-social"?{account:input.trim()}:app.id==="astro-dao"?{daoAccount:input.trim()}:{};const d=await client.run(app.id,app.actions[0].id,args);setResult(d.result)}catch(e:any){setError(e.message)}finally{setBusy(false)}}
 return <div className="porti-apps">
 <section className="apps-hero"><div><span className="apps-eyebrow">ONE COMPANION. A GROWING ECOSYSTEM.</span><h2>Your NEAR world,<br/>all together.</h2><p>Explore projects, read live contract data and keep your everyday tools close. Each app works inside Porti.</p><button className="secondary" onClick={()=>setDeveloper(!developer)}><Code2 size={16}/> Build for Porti</button></div><div className="apps-orbit" aria-hidden="true"><span><Blocks size={40}/></span><i><Waves size={25}/></i><b>✦</b><small>NEAR</small></div></section>
 <div className="apps-permission"><ShieldCheck size={19}/><span><strong>You stay in control.</strong> These apps only read public onchain data. Your AI key and wallet permissions are never shared with projects.</span></div>
 {sample&&<p className="apps-notice">Switch to Live to run apps or save favorites. No sample results are presented as onchain data.</p>}
 {error&&!app&&<p role="alert" className="apps-notice">{error}</p>}
 <div className="apps-toolbar"><h3>Explore apps <small>{portiApps.length} available</small></h3><label><Search size={16}/><input aria-label="Search Porti apps" placeholder="Find your next tool…" value={search} onChange={e=>setSearch(e.target.value)}/></label></div>
 <div className="apps-categories" role="group" aria-label="Filter apps by category">{["All","Exchange","Staking","Social","Governance"].map(c=><button key={c} aria-pressed={category===c} onClick={()=>setCategory(c)}>{c}</button>)}</div>
 <div className="apps-grid">{visible.map(a=><article className="apps-card" key={a.id}><div className="apps-card-top"><span className="apps-icon">{a.category==="Exchange"?<Blocks size={25}/>:a.category==="Social"?<Users size={25}/>:a.category==="Governance"?<Landmark size={25}/>:<Waves size={25}/>}</span><span className="apps-tag">{a.category}</span><button disabled={busy||sample} aria-label={`${pinned.includes(a.id)?"Unpin":"Pin"} ${a.name}`} aria-pressed={pinned.includes(a.id)} onClick={()=>pin(a.id)}><Pin size={17} fill={pinned.includes(a.id)?"currentColor":"none"}/></button></div><h3>{a.name}</h3><p>{a.description}</p><div className="apps-meta"><Check size={13}/> Read only · Mainnet <span>v{a.version}</span></div><button className="primary" disabled={busy} onClick={()=>{setActive(a.id);setInput(a.id==="rhea-pools"?"0":"");setResult(null);setError("")}}>Open app <ArrowUpRight size={16}/></button></article>)}</div>
 {!visible.length&&<p>No apps match your search.</p>}
 {app&&info&&<section ref={panel} className="apps-panel" aria-label={app.name}><header><div><span className="apps-eyebrow">LIVE CONTRACT WORKSPACE</span><h3>{app.name}</h3></div><button disabled={busy} aria-label="Close app" onClick={()=>{setActive("");setResult(null)}}><X size={19}/></button></header><p>{info.note}</p><form onSubmit={e=>{e.preventDefault();run()}}>{info.label&&<label>{info.label}<input required type={app.id==="rhea-pools"?"number":"text"} min="0" max="10000000" step="1" value={input} onChange={e=>setInput(e.target.value)} placeholder={info.placeholder}/></label>}<button className="primary" disabled={busy||sample}><RefreshCw size={15}/>{busy?"Reading chain…":"Read live data"}</button></form>
 {error&&<p role="alert" className="apps-notice">{error}</p>}
 {result&&<AppResult result={result}/>}
 <a href={app.website} target="_blank" rel="noopener noreferrer">Project website <ArrowUpRight size={13}/></a><small className="apps-disclosure">Independent Porti integration. No project endorsement implied.</small></section>}
 {developer&&<section className="apps-panel"><span className="apps-eyebrow">PORTI APPS SDK · MANIFEST V1</span><h3>Bring your project into Porti.</h3><p>Describe your app, its network and read capabilities. Validate the manifest here, then submit it with a server adapter for owner review. Validation does not install or execute a project.</p><label>App manifest<textarea aria-label="App manifest JSON" rows={16} spellCheck={false} value={manifest} onChange={e=>{setManifest(e.target.value);setValidation("")}}/></label><button className="secondary" onClick={()=>{try{const m=definePortiApp(JSON.parse(manifest));setValidation(`${m.name}: valid manifest. Owner-reviewed adapter required before registration.`)}catch{setValidation("Invalid manifest. Use the version 1 format, HTTPS website, mainnet and read-only actions.")}}}>Validate manifest</button><p role="status">{validation}</p><a href="/porti-apps-guide.md" target="_blank" rel="noopener noreferrer">Read developer guide <ArrowUpRight size={14}/></a></section>}
 </div>
}
