import {owner,sameOrigin,limit,readJSON,errorResponse} from '../../../../lib/workspace';
import {swapTokens,swapState,swapAction} from '../../../../lib/swaps';
export const dynamic='force-dynamic';
export async function GET(r:Request){try{const id=await owner();await limit(id,'swap-read',30);const q=new URL(r.url).searchParams;return Response.json(q.get('catalog')==='1'?{tokens:await swapTokens()}:await swapState(id),{headers:{'Cache-Control':'no-store'}})}catch(e){return errorResponse(e)}}
export async function POST(r:Request){try{sameOrigin(r);const id=await owner();await limit(id,'swap-action',6);return Response.json(await swapAction(id,await readJSON(r,2000)),{headers:{'Cache-Control':'no-store'}})}catch(e){return errorResponse(e)}}
