// Pure notification policy. Telegram text is plain text, never HTML/Markdown.
export const telegramDefaults={enabled:true,mode:'checks',timezone:'Africa/Lagos',digestHour:9,quietEnabled:false,quietStart:22,quietEnd:7,minNear:'0',concentration:true,balance:true,receipts:true};
export function telegramPreferences(input={}){
 const p={...telegramDefaults,...input};
 if(!['checks','daily'].includes(p.mode))throw new Error('Choose each-check alerts or a daily digest.');
 try{new Intl.DateTimeFormat('en',{timeZone:p.timezone}).format();}catch{throw new Error('Use a valid IANA timezone, such as Africa/Lagos.');}
 for(const k of ['digestHour','quietStart','quietEnd'])if(!Number.isInteger(p[k])||p[k]<0||p[k]>23)throw new Error('Hours must be between 0 and 23.');
 for(const k of ['enabled','quietEnabled','concentration','balance','receipts'])if(typeof p[k]!=='boolean')throw new Error('Invalid notification preference.');
 if(typeof p.minNear!=='string'||!/^\d{1,9}(\.\d{1,6})?$/.test(p.minNear))throw new Error('Minimum NEAR change must be a non-negative number with at most six decimals.');
 return Object.fromEntries(Object.keys(telegramDefaults).map(k=>[k,p[k]]));
}
export function localClock(now,timezone){const parts=new Intl.DateTimeFormat('en-CA',{timeZone:timezone,year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',hourCycle:'h23'}).formatToParts(new Date(now));const get=k=>parts.find(p=>p.type===k)?.value;return{day:`${get('year')}-${get('month')}-${get('day')}`,hour:Number(get('hour'))};}
export function isQuiet(p,now){if(!p.quietEnabled||p.quietStart===p.quietEnd)return false;const{hour}=localClock(now,p.timezone);return p.quietStart<p.quietEnd?hour>=p.quietStart&&hour<p.quietEnd:hour>=p.quietStart||hour<p.quietEnd;}
export function deliveryWindow(p,now,lastDigestDay){if(!p.enabled||isQuiet(p,now))return false;const c=localClock(now,p.timezone);return p.mode==='checks'||(c.hour>=p.digestHour&&lastDigestDay!==c.day);}
export function rawNearMin(value){const[a,b='']=value.split('.');return BigInt(a)*10n**24n+BigInt(b.padEnd(24,'0'));}
export function balanceDelta(previous,current,minNear='0'){
 if(!/^\d+$/.test(previous||'')||!/^\d+$/.test(current||''))return null;
 const delta=BigInt(current)-BigInt(previous),abs=delta<0n?-delta:delta;if(abs===0n||abs<rawNearMin(minNear))return null;
 const whole=abs/(10n**24n),fraction=(abs%(10n**24n)).toString().padStart(24,'0').slice(0,6).replace(/0+$/,'');
 return{direction:delta>0n?'increased':'decreased',amount:`${whole}${fraction?'.'+fraction:''}`||'0',raw:delta.toString()};
}
export function startCode(update){const m=update?.message;if(m?.chat?.type!=='private'||!Number.isSafeInteger(m.chat.id)||m.chat.id<=0||m.from?.id!==m.chat.id)return null;const match=/^\/start(?:@[a-zA-Z0-9_]+)? ([A-Za-z0-9_-]{43})$/.exec(m.text||'');return match?{code:match[1],chat:String(m.chat.id),label:m.from?.username?'@'+String(m.from.username).slice(0,40):String(m.from?.first_name||'Telegram user').slice(0,60)}:null;}
export function retryPolicy(attempt,status,retryAfter,now){if(status===403)return{status:'failed',nextAt:0,error:'Bot blocked or chat unavailable. Reconnect Telegram.'};if(attempt>=5)return{status:'failed',nextAt:0,error:'Delivery failed after five attempts.'};return{status:'pending',nextAt:now+(status===429?Math.max(1,Math.min(Number(retryAfter)||60,86400)):Math.min(3600,30*2**attempt))*1000,error:status===429?'Telegram rate limit; retry scheduled.':'Telegram unavailable; retry scheduled.'};}
export function safeBotToken(value){return typeof value==='string'&&/^\d{5,16}:[A-Za-z0-9_-]{25,100}$/.test(value);}
export function eventAllowed(p,type){return type==='test'||(p.enabled&&({concentration:p.concentration,balance:p.balance,receipt:p.receipts}[type]===true));}
