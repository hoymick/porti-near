"use client";
import { useEffect, useState } from "react";
import { ChevronDown } from "lucide-react";
const sections = [
 {label:"Research",items:["Investigate token","Track wallet","Rug Guard","Watchlist"]},
 {label:"Wallet",items:["Wallets","Transfers"]},
 {label:"Social & Alerts",items:["Friends","Telegram","Alerts"]},
 {label:"Settings",items:["Profile","Connections","System status"]},
];
export default function PortiNavigation({navigation,view,onNavigate,unread}:{navigation:readonly (readonly [string,any])[];view:string;onNavigate:(name:string)=>void;unread:number}) {
 const [expanded,setExpanded] = useState("");
 useEffect(()=>{setExpanded(sections.find(s=>s.items.includes(view))?.label||"")},[view]);
 function item(name:string,nested=false){const Icon=navigation.find(n=>n[0]===name)?.[1];return <button key={name} type="button" className={`${view===name?"active":""} ${nested?"porti-subnav-item":""}`} aria-current={view===name?"page":undefined} onClick={()=>onNavigate(name)}>{Icon&&<Icon size={nested?16:18}/>}<span>{name}</span>{name==="Alerts"&&unread>0&&<b className="sc-count">{unread}</b>}</button>}
 return <nav aria-label="Main navigation" className="porti-grouped-nav">{["Overview","Porti Apps","Ask Porti"].map(n=>item(n))}<div className="porti-nav-divider"/>{sections.map((section,index)=>{const selected=section.items.includes(view),open=expanded===section.label,Icon=navigation.find(n=>n[0]===section.items[0])?.[1];return <div className="porti-nav-group" key={section.label}><button type="button" className={`porti-nav-toggle ${selected?"section-current":""}`} aria-expanded={open} aria-controls={`porti-nav-section-${index}`} onClick={()=>setExpanded(open?"":section.label)}>{Icon&&<Icon size={18}/>}<span>{section.label}{selected&&!open&&<small>{view}</small>}</span>{section.label==="Social & Alerts"&&unread>0&&!open&&<b className="sc-count">{unread}</b>}<ChevronDown className={open?"is-open":""} size={15}/></button><div id={`porti-nav-section-${index}`} hidden={!open} className="porti-subnav">{section.items.map(n=>item(n,true))}</div></div>})}</nav>
}
