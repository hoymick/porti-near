import {owner,sameOrigin,limit,readJSON,errorResponse} from '../../../../lib/workspace';
import {xState,startX,unlinkX} from '../../../../lib/x-connect';
export const dynamic='force-dynamic';
export async function GET(){try{return Response.json(await xState(await owner()),{headers:{'Cache-Control':'no-store'}})}catch(e){return errorResponse(e)}}
export async function POST(r:Request){try{sameOrigin(r);const id=await owner();await limit(id,'x-link',3);const d=await readJSON(r,100);if(d.action==='unlink'){await unlinkX(id);return Response.json({ok:true})}if(d.action!=='connect')throw Error('Unknown X action');return Response.json(await startX(id,new URL(r.url).origin),{headers:{'Cache-Control':'no-store'}})}catch(e){return errorResponse(e)}}
