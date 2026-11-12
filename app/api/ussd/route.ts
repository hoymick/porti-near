// Africa's Talking USSD callback. Authenticated by PORTI_USSD_TOKEN in the URL
// (?token=...), not by Cloudflare Access: the provider cannot sign in.
import { ussdRequest } from "../../../lib/ussd";
export const dynamic = "force-dynamic";
export async function POST(r: Request) {
  return ussdRequest(r, "live");
}
