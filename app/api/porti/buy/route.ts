import {owner,sameOrigin,limit,readJSON,errorResponse} from '../../../../lib/workspace';
import {fundingStatus,preparePurchase} from '../../../../lib/funding';
export const dynamic='force-dynamic';
export async function GET(){try{await owner();return Response.json(fundingStatus(),{headers:{'Cache-Control':'no-store'}})}catch(e){return errorResponse(e)}}
export async function POST(r:Request){try{sameOrigin(r);const id=await owner();await limit(id,'buy-checkout',5);return Response.json(await preparePurchase(id,await readJSON(r,1000),r),{headers:{'Cache-Control':'no-store'}})}catch(e){return errorResponse(e)}}
