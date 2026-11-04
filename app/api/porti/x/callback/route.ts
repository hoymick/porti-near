import {owner,errorResponse} from '../../../../../lib/workspace';
import {finishX} from '../../../../../lib/x-connect';
export const dynamic='force-dynamic';
export async function GET(r:Request){try{const id=await owner(),u=new URL(r.url);await finishX(id,u.searchParams.get('code')||'',u.searchParams.get('state')||'');return new Response(null,{status:303,headers:{Location:'/?screen=profile','Cache-Control':'no-store','Referrer-Policy':'no-referrer'}})}catch(e){return errorResponse(e)}}
