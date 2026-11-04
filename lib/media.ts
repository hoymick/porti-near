import {env} from 'cloudflare:workers';
import {DomainError} from './errors.mjs';
import {imageInfo} from './image-core.mjs';
import {friendAllowed} from './friends';
export const imageIdOK=(id:unknown)=>typeof id==='string'&&/^[a-f0-9-]{36}$/.test(id);
export async function imageFor(id:string,key:string,scope?:string,pair?:string){
 if(!env.BUCKET||!imageIdOK(key))throw new DomainError('IMAGE_UNAVAILABLE','Image unavailable.',404);
 const o=await env.BUCKET.get('porti/'+key);const m=o?.customMetadata;
 if(!o||!m||!['ai','friend','charity'].includes(m.scope)||!Number.isFinite(Number(m.createdAt))||Number(m.createdAt)>Date.now()+60000||Date.now()-Number(m.createdAt)>90*86400000)throw new DomainError('IMAGE_UNAVAILABLE','Image unavailable or expired.',404);
 if(scope&&(m.scope!==scope||m.owner!==id||(pair&&m.pair!==pair)))throw new DomainError('IMAGE_ACCESS','This image belongs to another chat.',403);
 if(m.scope==='friend'){await friendAllowed(id,m.pair);}else if(m.scope==='charity'&&m.owner!==id){const {charityMediaAllowed}=await import('./charity');await charityMediaAllowed(id,key);}else if(m.owner!==id)throw new DomainError('IMAGE_ACCESS','Image unavailable.',403);
 return o;
}
export async function uploadImage(id:string,input:any){
 if(!env.BUCKET)throw new DomainError('MEDIA_NOT_READY','Private image storage is not configured.',503);
 if(!['ai','friend','charity'].includes(input.scope)||typeof input.base64!=='string'||input.base64.length>670000)throw new DomainError('IMAGE_INPUT','Choose a JPEG or PNG image.');
 if(input.scope==='friend')await friendAllowed(id,input.pair);
 let bytes:Uint8Array,info:any;try{bytes=Uint8Array.from(atob(input.base64),c=>c.charCodeAt(0));info=imageInfo(bytes)}catch(e:any){throw new DomainError('IMAGE_INPUT',e.message||'Image not recognized.')}
 const imageId=crypto.randomUUID();await env.BUCKET.put('porti/'+imageId,bytes,{httpMetadata:{contentType:info.mime},customMetadata:{owner:id,scope:input.scope,pair:input.scope==='friend'?input.pair:'',createdAt:String(Date.now())}});
 return {imageId,url:'/api/porti/images?id='+imageId,...info};
}
