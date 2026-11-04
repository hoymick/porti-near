import {owner,sameOrigin,readJSON,limit,errorResponse} from '../../../../lib/workspace';
import {charityState,charityAction} from '../../../../lib/charity';
export const dynamic='force-dynamic';
export async function GET(){try{const id=await owner();await limit(id,'charity-read',20);return Response.json(await charityState(id),{headers:{'Cache-Control':'private, no-store'}})}catch(e){return errorResponse(e)}}
export async function POST(r:Request){try{sameOrigin(r);const id=await owner(),input=await readJSON(r,8000);await limit(id,'charity-action',8);if(input.action==='submit')await limit(id,'charity-submit-day',2,86400000);return Response.json(await charityAction(id,input),{headers:{'Cache-Control':'no-store'}})}catch(e){return errorResponse(e)}}
