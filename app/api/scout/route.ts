import {owner,readWorkspace,sameOrigin,errorResponse} from '../../../lib/workspace';
import {safeScout,scoutAction,refreshWatch} from '../../../lib/scout-server';
import {DomainError} from '../../../lib/engine.mjs';
export const dynamic='force-dynamic';
export async function GET(){try{const id=await owner();return Response.json({scout:safeScout((await readWorkspace(id)).state)},{headers:{'Cache-Control':'no-store'}});}catch(e){return errorResponse(e);}}
export async function POST(request:Request){try{sameOrigin(request);const id=await owner();const raw=await request.text();if(raw.length>5000)throw new DomainError('INPUT_TOO_LARGE','Request too large.',413);let input;try{input=JSON.parse(raw);}catch{throw new DomainError('INVALID_JSON','Invalid request.');}if(!input||typeof input!=='object')throw new DomainError('INVALID_REQUEST','Invalid request.');const result=input.action==='refresh'?await refreshWatch(id,input.id):await scoutAction(id,input);return Response.json({...result,scout:safeScout((await readWorkspace(id)).state)},{headers:{'Cache-Control':'no-store'}});}catch(e){return errorResponse(e);}}
