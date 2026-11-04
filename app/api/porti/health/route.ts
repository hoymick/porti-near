import {
  owner,
  errorResponse,
  limit,
  sameOrigin,
  readJSON,
} from "../../../../lib/workspace";
import { systemStatus } from "../../../../lib/health";
export const dynamic = "force-dynamic";
export async function GET() {
  try {
    const id = await owner();
    await limit(id, "health-read", 30);
    return Response.json(await systemStatus(id), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (e) {
    return errorResponse(e);
  }
}
export async function POST(r: Request) {
  try {
    sameOrigin(r);
    const id = await owner();
    await readJSON(r, 100);
    await limit(id, "health-probe", 3);
    return Response.json(await systemStatus(id, true), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (e) {
    return errorResponse(e);
  }
}
