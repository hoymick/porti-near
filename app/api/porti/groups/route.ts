import {owner,sameOrigin,errorResponse,readJSON,limit} from '../../../../lib/workspace';
import {groupAction,groupsState} from '../../../../lib/groups';
export const dynamic='force-dynamic';
export async function GET(r:Request){try{const id=await owner();await limit(id,'group-read',120);return Response.json(await groupsState(id,new URL(r.url).searchParams.get('group')||undefined),{headers:{'Cache-Control':'no-store'}});}catch(e){return errorResponse(e);}}
export async function POST(r:Request){try{sameOrigin(r);const id=await owner(),input=await readJSON(r,9000);await limit(id,'group-write',30);if(input.action==='create')await limit(id,'group-create',3,3600000);if(input.action==='invite')await limit(id,'group-invite',10,3600000);return Response.json({ok:true,...await groupAction(id,input)});}catch(e){return errorResponse(e);}}
