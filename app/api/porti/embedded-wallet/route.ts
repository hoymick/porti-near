import {env} from 'cloudflare:workers';
import {owner,limit,errorResponse} from '../../../../lib/workspace';
import {embeddedConfig} from '../../../../lib/embedded-config.mjs';
export const dynamic='force-dynamic';
export async function GET(r:Request){try{const id=await owner();await limit(id,'embedded-config',30);const localScope=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',new TextEncoder().encode('porti-local-wallet-v1:'+id))),x=>x.toString(16).padStart(2,'0')).join('');return Response.json({...embeddedConfig(env,new URL(r.url).origin),localScope},{headers:{'Cache-Control':'private, no-store'}})}catch(e){return errorResponse(e)}}
