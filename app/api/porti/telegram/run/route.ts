// Shared maintenance endpoint: protected by the owner-private Sites dispatcher.
// No visitor impersonation. Keep this Site owner-private.
import { env } from "cloudflare:workers";
import { runTelegram } from "../../../../../lib/telegram";
import {
  errorResponse,
  sameOrigin,
  readJSON,
} from "../../../../../lib/workspace";
export const dynamic = "force-dynamic";
export async function GET() {
  try {
    if ((env as any).PORTI_HOST_MODE === "cloudflare") return Response.json({error:{code:"RUNNER_DISABLED",message:"Standalone background runner is not configured."}},{status:403});
    const r = await env
      .DB!.prepare(
        "SELECT id,value FROM porti_runs WHERE id IN ('telegram','schedule')",
      )
      .all();
    return Response.json(
      {
        runs: r.results.map((x: any) => ({ id: x.id, ...JSON.parse(x.value) })),
      },
      { headers: { "Cache-Control": "no-store" } },
    );
  } catch (e) {
    return errorResponse(e);
  }
}
export async function POST(r: Request) {
  try {
    if ((env as any).PORTI_HOST_MODE === "cloudflare") return Response.json({error:{code:"RUNNER_DISABLED",message:"Standalone background runner is not configured."}},{status:403});
    sameOrigin(r, { service: true });
    const input = await readJSON(r, 1000);
    if (!["run", "register-schedule"].includes(input.action))
      return Response.json(
        {
          error: {
            code: "INVALID_ACTION",
            message: "Use a supported maintenance action.",
          },
        },
        { status: 400 },
      );
    if (
      input.action === "register-schedule" &&
      typeof input.scheduleId === "string" &&
      input.scheduleId.length < 150 &&
      /^Automation_[a-zA-Z0-9]+$/.test(input.scheduleId) &&
      Number.isInteger(input.intervalMinutes) &&
      input.intervalMinutes >= 60 &&
      input.intervalMinutes <= 1440
    ) {
      await env
        .DB!.prepare(
          "INSERT INTO porti_runs(id,value) VALUES('schedule',?) ON CONFLICT(id) DO UPDATE SET value=excluded.value",
        )
        .bind(
          JSON.stringify({
            id: input.scheduleId,
            intervalMinutes: input.intervalMinutes,
            enabled: true,
          }),
        )
        .run();
      return Response.json({ registered: true });
    }
    return Response.json(await runTelegram());
  } catch (e) {
    return errorResponse(e);
  }
}
