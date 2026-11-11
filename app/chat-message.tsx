'use client';
export default function ChatMessage({message,name}:{message:any;name:string}){
 let image:any=null;
 try{const parsed=JSON.parse(message.body);if(parsed&&typeof parsed.portiImage==='string'&&/^[a-f0-9-]{36}$/.test(parsed.portiImage)&&typeof parsed.caption==='string')image=parsed;}catch{}
 return <article className={message.mine?'mine':''}><small>{message.mine?'You':name} · <time dateTime={new Date(message.createdAt).toISOString()}>{new Date(message.createdAt).toLocaleString()}</time></small>{image?<><img className="porti-chat-image" src={'/api/porti/images?id='+image.portiImage} alt="Shared photo" loading="lazy"/><p>{image.caption}</p></>:<p>{message.body}</p>}</article>;
}
