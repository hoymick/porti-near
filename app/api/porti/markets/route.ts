import {owner,limit,errorResponse} from '../../../../lib/workspace';
import {nearMarkets} from '../../../../lib/markets';
export const dynamic='force-dynamic';
export async function GET(){try{const id=await owner();await limit(id,'markets-read',20);return Response.json(await nearMarkets(),{headers:{'Cache-Control':'no-store'}})}catch(e){return errorResponse(e)}}
