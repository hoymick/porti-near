'use client';
import {useEffect,useRef} from 'react';
// Register only while the exact reviewed action is visible. Never auto-run it.
export default function useChatConfirmation(register:any,key:string,approve:()=>Promise<any>,cancel?:()=>Promise<any>) {
 const current=useRef({approve,cancel});current.current={approve,cancel};
 useEffect(()=>{
  if(!register||!key)return;
  const action={key,approve:()=>current.current.approve(),cancel:()=>current.current.cancel?.()};
  register(action);
  return()=>register(null,action);
 },[register,key]);
}
