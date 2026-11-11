// Public USSD simulator for judges. Accepts only +999 test numbers, which can
// only be linked to simulator pockets; caps on those pockets bound any abuse.
import { ussdRequest } from "../../../../lib/ussd";
export const dynamic = "force-dynamic";
export async function POST(r: Request) {
  return ussdRequest(r, "simulator");
}
