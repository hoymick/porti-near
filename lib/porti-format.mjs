export const EXPLORER='https://nearblocks.io';
export const accountValue=a=>typeof a==='string'?a:a?.hash||'';
export function formatAmount(raw,decimals=24){try{const n=BigInt(raw),sign=n<0n?'-':'',abs=n<0n?-n:n,d=Math.min(36,Math.max(0,Number(decimals)||0)),s=abs.toString().padStart(d+1,'0');const fraction=d?s.slice(-d).slice(0,5).replace(/0+$/,''):'';return sign+s.slice(0,s.length-d)+(fraction?'.'+fraction:'');}catch{return 'Unknown';}}
