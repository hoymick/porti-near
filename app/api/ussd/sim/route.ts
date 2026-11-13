// Public USSD simulator for judges. Accepts only +999 test numbers, which can
// only be linked to simulator pockets; caps on those pockets bound any abuse.
import { simulatorInfo, ussdRequest } from "../../../../lib/ussd";
export const dynamic = "force-dynamic";
export async function POST(r: Request) {
  return ussdRequest(r, "simulator");
}
// Network, demo pocket and recipients, so visitors can verify sends on an explorer.
export async function GET() {
  return Response.json(simulatorInfo(), { headers: { "Cache-Control": "no-store" } });
}
