import {owner,sameOrigin,readJSON,limit,errorResponse} from '../../../../lib/workspace';
import {stakingState,stakingAction} from '../../../../lib/staking';
export const dynamic='force-dynamic';
export async function GET(){try{const id=await owner();await limit(id,'staking-read',30);return Response.json(await stakingState(id),{headers:{'Cache-Control':'no-store'}})}catch(e){return errorResponse(e)}}
export async function POST(r:Request){try{sameOrigin(r);const id=await owner();await limit(id,'staking-write',6);return Response.json(await stakingAction(id,await readJSON(r,2000)),{headers:{'Cache-Control':'no-store'}})}catch(e){return errorResponse(e)}}
