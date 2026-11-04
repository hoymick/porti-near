import { owner, errorResponse, limit } from "../../../../lib/workspace";
import { tokenChart } from "../../../../lib/token-chart";
export const dynamic = "force-dynamic";
export async function GET(r: Request) {
  try {
    const id = await owner();
    await limit(id, "chart-read", 30);
    const q = new URL(r.url).searchParams;
    return Response.json(
      await tokenChart(q.get("contract") || "", q.get("frame") || "1h"),
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (e) {
    return errorResponse(e);
  }
}
