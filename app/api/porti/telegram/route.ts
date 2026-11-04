import {
  owner,
  sameOrigin,
  errorResponse,
  readJSON,
  limit,
} from "../../../../lib/workspace";
import { telegramAction, telegramState } from "../../../../lib/telegram";
export const dynamic = "force-dynamic";
export async function GET() {
  try {
    const id = await owner();
    await limit(id, "telegram-read", 60);
    return Response.json(await telegramState(id), {
      headers: { "Cache-Control": "no-store" },
    });
  } catch (e) {
    return errorResponse(e);
  }
}
export async function POST(r: Request) {
  try {
    sameOrigin(r);
    const id = await owner(),
      input = await readJSON(r, 3000);
    await limit(id, "telegram-write", 10);
    return Response.json({
      ...(await telegramAction(id, input)),
      state: await telegramState(id),
    });
  } catch (e) {
    return errorResponse(e);
  }
}
