'use client';
import {useEffect,useRef} from 'react';
// Register only while the exact reviewed action is visible. Never auto-run it.
export default function useChatConfirmation(register:any,key:string,approve:()=>Promise<any>,cancel?:()=>Promise<any>) {
 const current=useRef({key,approve,cancel});current.current={key,approve,cancel};
 useEffect(()=>{
  if(!register||!key)return;
  const action={key,approve:()=>current.current.key===key?current.current.approve():undefined,cancel:()=>current.current.key===key?current.current.cancel?.():undefined};
  register(action);
  return()=>register(null,action);
 },[register,key]);
}
