import {
  owner,
  sameOrigin,
  errorResponse,
  readJSON,
  limit,
} from "../../../../lib/workspace";
import { friendAction, friendsState } from "../../../../lib/friends";
async function reader() {
  const id = await owner();
  await limit(id, "friend-read", 120);
  return id;
}
export const dynamic = "force-dynamic";
export async function GET(r: Request) {
  try {
    return Response.json(
      await friendsState(
        await reader(),
        new URL(r.url).searchParams.get("pair") || undefined,
      ),
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (e) {
    return errorResponse(e);
  }
}
export async function POST(r: Request) {
  try {
    sameOrigin(r);
    const id = await owner(),
      input = await readJSON(r, 9000);
    await limit(id, "friend-write", 30);
    if (input.action === "request")
      await limit(id, "friend-requests", 10, 3600000);
    await friendAction(id, input);
    return Response.json({ ok: true });
  } catch (e) {
    return errorResponse(e);
  }
}
