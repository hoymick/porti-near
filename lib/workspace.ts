import { env } from "cloudflare:workers";
import { getChatGPTUser } from "../app/chatgpt-auth";
import { checkOrigin, consumeLimit } from "./request-guard.mjs";
import { DomainError } from "./errors.mjs";
import { readWorkspace as readStore, mutateWorkspace } from "./store.mjs";

export async function owner() {
  const user = await getChatGPTUser();
  if (!user)
    throw new DomainError(
      "SIGN_IN_REQUIRED",
      "Sign in to open your private workspace.",
      401,
    );
  return user.userId;
}
export { readJSON } from "./request-guard.mjs";
export function sameOrigin(request: Request, options?: { service?: boolean }) {
  return checkOrigin(request, options);
}
export async function limit(
  id: string,
  bucket: string,
  max = 60,
  windowMs = 60000,
) {
  return consumeLimit(env.DB, id, bucket, max, windowMs);
}
export async function readWorkspace(ownerId: string) {
  return readStore(env.DB, ownerId);
}
export async function mutate<T>(
  ownerId: string,
  change: (state: any) => T,
): Promise<{ state: any; result: T }> {
  return mutateWorkspace(env.DB, ownerId, change);
}
export function errorResponse(e: any) {
  const requestId = crypto.randomUUID(),
    known = e instanceof DomainError,
    code = known ? e.code : "INTERNAL_ERROR",
    status = known ? e.status : 500;
  // Never log provider URLs, raw exception messages, bodies, tokens or wallet proofs.
  console[status >= 500 ? "error" : "warn"](
    JSON.stringify({ component: "porti-api", requestId, code, status }),
  );
  return Response.json(
    {
      error: {
        code,
        message: known
          ? e.message
          : "The request could not be completed. Please retry.",
        requestId,
      },
    },
    {
      status,
      headers: {
        "Cache-Control": "no-store",
        "X-Request-Id": requestId,
        ...(e.retryAfter ? { "Retry-After": String(e.retryAfter) } : {}),
      },
    },
  );
}
