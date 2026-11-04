import {owner,errorResponse} from '../../../../lib/workspace';
import {tokenChart} from '../../../../lib/token-chart';
export const dynamic='force-dynamic';
export async function GET(r:Request){try{await owner();const q=new URL(r.url).searchParams;return Response.json(await tokenChart(q.get('contract')||'',q.get('frame')||'1h'),{headers:{'Cache-Control':'private, max-age=60'}});}catch(e){return errorResponse(e);}}
