export function typedTransferMatches(message,args){
 if(typeof message!=='string'||typeof args?.recipient!=='string'||typeof args.amount!=='string'||!/^\d+(\.\d+)?$/.test(args.amount))return false;
 const text=message.toLowerCase(),recipient=args.recipient.toLowerCase();
 // Match complete account/handle tokens, never a substring of another destination.
 const tokens=text.match(/@?[a-z0-9][a-z0-9._-]*/g)||[];
 if(!tokens.includes(recipient))return false;
 const norm=x=>x.replace(/^0+(?=\d)/,'').replace(/(\.\d*?)0+$/,'$1').replace(/\.$/,'');
 const amounts=message.match(/\b\d+(?:\.\d+)?\b/g)||[];
 return amounts.some(x=>norm(x)===norm(args.amount));
}
