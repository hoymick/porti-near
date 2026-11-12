import {DomainError} from './errors.mjs';
export function assertChatActive(p,requestId){
 if(p.cancelledChatTurns?.some(t=>t.id===requestId))throw new DomainError('CHAT_CANCELLED','This reply was stopped.',409);
}
export function cancelChatTurn(p,requestId,now=Date.now()){
 if(typeof requestId!=='string'||!/^[a-zA-Z0-9-]{10,80}$/.test(requestId))throw new DomainError('INVALID_CHAT','Specify the chat request to stop.');
 p.cancelledChatTurns=[...(p.cancelledChatTurns||[]).filter(t=>now-t.at<600000&&t.id!==requestId),{id:requestId,at:now}].slice(-30);
 if(p.chatLock?.id===requestId){delete p.chatLock;delete p.pendingChatTransfer;}
}
