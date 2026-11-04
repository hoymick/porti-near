import {env} from 'cloudflare:workers';
import {sameOrigin,errorResponse} from '../../../../../lib/workspace';
import {runTelegramBackground} from '../../../../../lib/telegram';
export const dynamic='force-dynamic';
// Shared unattended updater. Sites dispatch enforces owner-private access before
// this route; service callers use supported OAI-Sites-Authorization access.
// Do not make this Site public without adding separate runner authorization.
export async function POST(request:Request){try{sameOrigin(request);const db=env.DB as any;await db.prepare("INSERT OR IGNORE INTO telegram_runs(id,last_run) VALUES('throttle',0)").run();const now=Date.now();const claim=await db.prepare("UPDATE telegram_runs SET last_run=? WHERE id='throttle' AND last_run<?").bind(now,now-60000).run();if(claim.meta.changes!==1)return Response.json({status:'already_checked'},{headers:{'Cache-Control':'no-store'}});return Response.json({status:'completed',...await runTelegramBackground()},{headers:{'Cache-Control':'no-store'}});}catch(e){return errorResponse(e);}}
export async function GET(){const row=await (env.DB as any).prepare("SELECT last_run,last_result FROM telegram_runs WHERE id='global'").first();return Response.json({lastRun:row?.last_run||null,result:row?.last_result?JSON.parse(row.last_result):null},{headers:{'Cache-Control':'no-store'}});}
