// Shared maintenance endpoint: protected by the owner-private Sites dispatcher.
// No visitor impersonation. Keep this Site owner-private.
import {env} from 'cloudflare:workers';
import {runTelegram} from '../../../../../lib/telegram';
import {errorResponse,sameOrigin} from '../../../../../lib/workspace';
export const dynamic='force-dynamic';
export async function GET(){try{const r=await env.DB!.prepare('SELECT id,value FROM porti_runs WHERE id IN (\'telegram\',\'schedule\')').all();return Response.json({runs:r.results.map((x:any)=>({id:x.id,...JSON.parse(x.value)}))},{headers:{'Cache-Control':'no-store'}});}catch(e){return errorResponse(e);}}
export async function POST(r:Request){try{sameOrigin(r);const raw=await r.text();if(raw.length>1000)return Response.json({error:'Request too large'},{status:413});const input=raw?JSON.parse(raw):{};if(input.action==='register-schedule'&&typeof input.scheduleId==='string'&&input.scheduleId.length<150){await env.DB!.prepare("INSERT INTO porti_runs(id,value) VALUES('schedule',?) ON CONFLICT(id) DO UPDATE SET value=excluded.value").bind(JSON.stringify({id:input.scheduleId,intervalMinutes:input.intervalMinutes,enabled:true})).run();return Response.json({registered:true});}return Response.json(await runTelegram());}catch(e){return errorResponse(e);}}
