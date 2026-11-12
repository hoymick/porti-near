import {stakeChatIntent} from './stake-chat-intent.mjs';
import {stakingAction} from './staking';
import {portiConfig,initialPorti} from './near-services';
import {mutate} from './workspace';
import {assertChatActive} from './chat-cancellation.mjs';
import {DomainError} from './errors.mjs';
export async function stakeChat(id:string,input:any){
 if(!/^[a-zA-Z0-9-]{10,80}$/.test(input.requestId))throw new DomainError('INVALID_CHAT','Retry from a new chat message.');
 const p=(await portiConfig(id,'state')).p,intent=stakeChatIntent(input.message,{wallet:input.wallet,roles:p.walletRoles,imageId:input.imageId});
 let prior:any;
 await mutate(id,s=>{s.porti??=initialPorti();const p=s.porti;assertChatActive(p,input.requestId);prior=p.messages.find((m:any)=>m.requestId===input.requestId&&m.role==='assistant');if(prior)return;if(p.chatLock&&Date.now()-p.chatLock.at<300000)throw new DomainError('CHAT_BUSY','Porti is finishing a request.');p.chatLock={id:input.requestId,at:Date.now()};p.messages.push({id:crypto.randomUUID(),requestId:input.requestId,role:'user',content:input.message,createdAt:Date.now()});});
 if(prior)return {reply:prior,cards:prior.cards};
 const cards:any[]=[],steps:any[]=[];let content='';
 try{
  if(!intent||intent.error)throw new DomainError('STAKE_INTENT',intent?.error||'Specify the exact NEAR amount and source wallet, for example: Stake 1 NEAR from my agent wallet.');
  assertChatActive((await portiConfig(id,'state')).p,input.requestId);
  const {draft}=await stakingAction(id,{action:'prepare',...intent,requestId:input.requestId});
  cards.push({type:'stake-review',id:input.requestId,draft});steps.push({tool:'prepare_stake',status:'completed'});
  content='Your staking review is ready below. Check the amount, source wallet, Meta Pool contract, estimated stNEAR and fees. Choose Approve or reply “yes” to open your wallet. Nothing has been signed or sent.';
 }catch(e:any){content=e instanceof DomainError?e.message:'The staking service could not prepare this review. Nothing was signed or sent.';steps.push({tool:'prepare_stake',status:'failed',message:content});}
 const reply={id:crypto.randomUUID(),requestId:input.requestId,role:'assistant',content,cards,steps,createdAt:Date.now(),provider:'Porti staking flow'};
 await mutate(id,s=>{assertChatActive(s.porti,input.requestId);if(s.porti.chatLock?.id!==input.requestId)throw new DomainError('CHAT_SUPERSEDED','This staking request is no longer active.');s.porti.messages.push(reply);s.porti.messages=s.porti.messages.slice(-100);delete s.porti.chatLock;});return {reply,cards};
}
