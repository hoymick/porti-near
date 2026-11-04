import {owner,sameOrigin,readJSON,limit,errorResponse} from '../../../../lib/workspace';
import {imageFor,uploadImage} from '../../../../lib/media';
export const dynamic='force-dynamic';
export async function POST(r:Request){try{sameOrigin(r);const id=await owner();await limit(id,'image-hour',10,3600000);await limit(id,'image-day',30,86400000);return Response.json(await uploadImage(id,await readJSON(r,680000)),{headers:{'Cache-Control':'no-store'}})}catch(e){return errorResponse(e)}}
export async function GET(r:Request){try{const id=await owner();await limit(id,'image-read',180);const o=await imageFor(id,new URL(r.url).searchParams.get('id')||'');return new Response(o.body,{headers:{'Content-Type':o.httpMetadata?.contentType||'image/jpeg','Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff','Content-Security-Policy':"default-src 'none'; sandbox"}})}catch(e){return errorResponse(e)}}
