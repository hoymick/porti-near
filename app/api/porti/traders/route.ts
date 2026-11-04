import {owner,limit,errorResponse} from '../../../../lib/workspace';
import {tokenTraders} from '../../../../lib/token-traders';
export const dynamic='force-dynamic';
export async function GET(request:Request){try{const id=await owner();await limit(id,'traders-read',12);return Response.json(await tokenTraders(new URL(request.url).searchParams.get('contract')||''),{headers:{'Cache-Control':'no-store'}})}catch(e){return errorResponse(e)}}
