import {owner,sameOrigin,errorResponse} from '../../../../lib/workspace';
import {telegramAction,telegramState} from '../../../../lib/telegram';
export const dynamic='force-dynamic';
export async function GET(){try{return Response.json(await telegramState(await owner()),{headers:{'Cache-Control':'no-store'}});}catch(e){return errorResponse(e);}}
export async function POST(r:Request){try{sameOrigin(r);const id=await owner(),raw=await r.text();if(raw.length>3000)return Response.json({error:{message:'Request too large.'}},{status:413});return Response.json({...await telegramAction(id,JSON.parse(raw)),state:await telegramState(id)});}catch(e){return errorResponse(e);}}
