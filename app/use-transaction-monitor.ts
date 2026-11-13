'use client';
import {useEffect,useRef} from 'react';
// Reconciliation only: never opens a wallet, prepares or sends a payment.
export default function useTransactionMonitor(key:string,enabled:boolean,read:()=>Promise<any>,receive:(value:any)=>void,onPause:(message:string)=>void){
 const current=useRef({read,receive,onPause});current.current={read,receive,onPause};
 useEffect(()=>{
  if(!key||!enabled)return;
  let alive=true,running=false,attempts=0,failures=0;
  const timer=setInterval(async()=>{
   if(!alive||running||document.hidden)return;
   if(attempts>=20){clearInterval(timer);current.current.onPause('Automatic checks paused. Use the original review to verify again; do not submit a replacement transaction.');return;}
   running=true;attempts++;
   try{const value=await current.current.read();if(alive){failures=0;current.current.receive(value);}}
   catch{if(alive&&++failures>=3){clearInterval(timer);current.current.onPause('Confirmation is still unavailable. Keep the original hash and verify its outcome; do not send again.');}}
   finally{running=false;}
  },15000);
  return()=>{alive=false;clearInterval(timer)};
 },[key,enabled]);
}
