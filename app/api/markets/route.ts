import {owner,errorResponse} from '../../../lib/workspace';
import {lighterMarkets} from '../../../lib/trading-server';
export const dynamic='force-dynamic';
export async function GET(){try{await owner();return Response.json(await lighterMarkets(),{headers:{'Cache-Control':'no-store'}});}catch(e){return errorResponse(e);}}
