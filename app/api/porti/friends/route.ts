import {owner,sameOrigin,errorResponse} from '../../../../lib/workspace';
import {friendAction,friendsState} from '../../../../lib/friends';
export const dynamic='force-dynamic';
export async function GET(r:Request){try{return Response.json(await friendsState(await owner(),new URL(r.url).searchParams.get('pair')||undefined),{headers:{'Cache-Control':'no-store'}});}catch(e){return errorResponse(e);}}
export async function POST(r:Request){try{sameOrigin(r);const id=await owner(),raw=await r.text();if(raw.length>6000)return Response.json({error:{message:'Request too large.'}},{status:413});await friendAction(id,JSON.parse(raw));return Response.json({ok:true});}catch(e){return errorResponse(e);}}
