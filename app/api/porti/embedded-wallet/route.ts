import {env} from 'cloudflare:workers';
import {owner,limit,errorResponse} from '../../../../lib/workspace';
import {embeddedConfig} from '../../../../lib/embedded-config.mjs';
export const dynamic='force-dynamic';
export async function GET(r:Request){try{const id=await owner();await limit(id,'embedded-config',30);return Response.json(embeddedConfig(env,new URL(r.url).origin),{headers:{'Cache-Control':'private, no-store'}})}catch(e){return errorResponse(e)}}
