import {assertChatActive} from './chat-cancellation.mjs';
import {swapTokens,swapAction} from './swaps';
import {swapChatIntent} from './swap-chat-intent.mjs';
import {portiConfig,initialPorti} from './near-services';
import {mutate} from './workspace';
import {DomainError} from './errors.mjs';
export async function prepareChatSwap(id:string,request:any){
 const tokens=await swapTokens(),destination=tokens.find((t:any)=>t.blockchain==='near'&&t.contract===request.contract);
 if(!destination)throw new DomainError('SWAP_TOKEN_UNAVAILABLE','This exact token is not in the current NEAR Intents catalog. Porti cannot verify an executable route for it through this provider. No swap was prepared or sent.');
 const recipe={sender:request.sender,destination:destination.assetId,amount:request.amount,slippage:request.slippage,recipient:request.sender};
 const reg=await swapAction(id,{action:'register',...recipe});
 if(!reg.registered)return {recipe,registration:reg.registration};
 const preview=await swapAction(id,{action:'preview',...recipe});
 const ready=await swapAction(id,{action:'approve',orderId:preview.order.id});
 return {recipe,order:ready.order};
}
export async function swapChat(id:string,input:any){
 if(!/^[a-zA-Z0-9-]{10,80}$/.test(input.requestId))throw new DomainError('INVALID_CHAT','Retry from a new chat message.');
 const config=await portiConfig(id,'state'),intent=swapChatIntent(input.message,{wallet:input.wallet,roles:config.p.walletRoles,imageId:input.imageId});
 let prior:any;
 await mutate(id,s=>{s.porti??=initialPorti();const p=s.porti;assertChatActive(p,input.requestId);prior=p.messages.find((m:any)=>m.requestId===input.requestId&&m.role==='assistant');if(prior)return;if(p.chatLock&&Date.now()-p.chatLock.at<300000)throw new DomainError('CHAT_BUSY','Porti is finishing another request.');p.chatLock={id:input.requestId,at:Date.now()};p.messages.push({id:crypto.randomUUID(),requestId:input.requestId,role:'user',content:input.message,createdAt:Date.now()});});
 if(prior)return {reply:prior,cards:prior.cards};
 const cards:any[]=[],steps:any[]=[];let content='';
 try{
  if(!intent||intent.error)throw new DomainError('SWAP_INTENT',intent?.error||'Specify an exact native NEAR amount, exact NEAR token contract and source wallet. No swap was prepared.');
  const prepared=await prepareChatSwap(id,intent);cards.push({type:'swap-review',id:input.requestId,...prepared});steps.push({tool:'prepare_swap',status:'completed'});
  content=prepared.registration?'This token needs receive-token registration for your selected wallet. Review the registration deposit below and choose Approve or reply “yes”. I will verify registration on-chain before preparing your swap quote. No swap has been sent.':'Your executable swap quote is ready below. Check the exact input, minimum output, wallet and fees, then choose Approve or reply “yes” to open your wallet. Nothing has been signed or sent.';
 }catch(e:any){content=e instanceof DomainError?e.message:'The swap provider could not prepare this request. No swap was sent.';steps.push({tool:'prepare_swap',status:'failed',message:content});}
 const reply={id:crypto.randomUUID(),requestId:input.requestId,role:'assistant',content,cards,steps,createdAt:Date.now(),provider:'Porti swap flow'};
 await mutate(id,s=>{if(s.porti.chatLock?.id!==input.requestId)throw new DomainError('CHAT_SUPERSEDED','This request is no longer active.');s.porti.messages.push(reply);s.porti.messages=s.porti.messages.slice(-100);delete s.porti.chatLock;});return {reply,cards};
}
