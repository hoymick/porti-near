'use client';
import Staking from './staking';
export default function ChatStakeReview({card,active,sample,register,requireWallet,onStatus}:{card:any,active:boolean,sample:boolean,register:any,requireWallet:(sender?:string)=>Promise<any>,onStatus:(message:string)=>void}){
 return <Staking key={card.draft.id} initialDraft={card.draft} compact active={active} account={card.draft.sender} wallet={null} sample={sample} requireWallet={()=>requireWallet(card.draft.sender)} onConnect={()=>{}} onConfirmation={active?register:undefined} onStatus={onStatus}/>;
}
