import { owner, readWorkspace, mutate, sameOrigin, readJSON, limit, errorResponse } from "../../../../lib/workspace";
import { DomainError } from "../../../../lib/errors.mjs";
import { initialPorti } from "../../../../lib/near-services";
import { portiApps, registeredApp } from "../../../../lib/porti-app-registry";
import { runPortiApp } from "../../../../lib/porti-apps";
export const dynamic = "force-dynamic";
async function appState(id: string) {
  const p = (await readWorkspace(id)).state.porti;
  return {apps:portiApps,pinned:(p?.pinnedApps || []).filter((x: string) => registeredApp(x))};
}
const respond = (data: unknown) => Response.json(data,{headers:{"Cache-Control":"no-store"}});
export async function GET() { try { const id = await owner(); await limit(id,"apps-read",60); return respond(await appState(id)); } catch(e) {return errorResponse(e);} }
export async function POST(request: Request) { try {
  sameOrigin(request); const id = await owner(); await limit(id,"apps-action",12);
  const input = await readJSON(request,2000);
  if (!registeredApp(input.appId)) throw new DomainError("APP_UNKNOWN","Choose a registered Porti app.");
  if (input.action === "run") return respond({result:await runPortiApp(id,input.appId,input.actionId,input.args)});
  if (input.action !== "pin" || typeof input.pinned !== "boolean") throw new DomainError("APP_ACTION","Unknown app operation.");
  await mutate(id,s => {s.porti ??= initialPorti(); const p=s.porti; const pins = new Set<string>((p.pinnedApps || []).filter((x: string) => registeredApp(x))); if(input.pinned) pins.add(input.appId); else pins.delete(input.appId); p.pinnedApps = [...pins];});
  return respond(await appState(id));
} catch(e) {return errorResponse(e);} }
