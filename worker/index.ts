import {standaloneRequest} from '../lib/cloudflare-access.mjs';
import handler from "vinext/server/fetch-handler";
import { runWithConnectorBinding } from "../lib/connector-context";
import type { ConnectorBinding } from "../lib/connector-contract.mjs";

const worker = {
  async fetch(
    request: Request,
    env: Cloudflare.Env,
    ctx: ExecutionContext<{ CONNECTORS?: ConnectorBinding }>,
  ) {
    const guarded = await standaloneRequest(request, env);
    if (guarded instanceof Response) return guarded;
    request = guarded;
    let binding = ctx.props?.CONNECTORS;
    // Local preview emulates the same request-scoped capability. This branch and
    // the auxiliary service binding are absent from production builds.
    if (import.meta.env.DEV && !binding && env.CONNECTORS) {
      const preview = env.CONNECTORS;
      const expiresAt = Date.now() + 60_000;
      binding = {
        async getContext() {
          if (Date.now() >= expiresAt)
            return { status: "request_context_expired" };
          return preview.getContext?.() ?? { status: "binding_unavailable" };
        },
        async invoke(connectorId, actionName, args) {
          if (Date.now() >= expiresAt) {
            return {
              status: "request_context_expired",
              message: "This request has expired. Please try again.",
            };
          }
          return preview.invoke(connectorId, actionName, args);
        },
      };
    }
    try {
      const response = await runWithConnectorBinding(binding, () =>
        handler.fetch(request, env, ctx),
      );
      const headers = new Headers(response.headers);
      headers.set("X-Content-Type-Options", "nosniff");
      headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
      headers.set(
        "Content-Security-Policy",
        "base-uri 'self'; object-src 'none'",
      );
      if (!headers.has("X-Request-Id"))
        headers.set("X-Request-Id", crypto.randomUUID());
      if (new URL(request.url).pathname.startsWith("/api/")) {
        headers.set("Cache-Control", "no-store");
        headers.set("Vary", "Cookie");
      }
      return new Response(response.body, {
        status: response.status,
        statusText: response.statusText,
        headers,
      });
    } catch {
      const requestId = crypto.randomUUID();
      console.error(
        JSON.stringify({
          component: "porti-worker",
          requestId,
          code: "UNHANDLED_REQUEST",
          status: 500,
        }),
      );
      return Response.json(
        {
          error: {
            code: "INTERNAL_ERROR",
            message: "Request unavailable. Please retry.",
            requestId,
          },
        },
        {
          status: 500,
          headers: {
            "Cache-Control": "no-store",
            "X-Request-Id": requestId,
            "X-Content-Type-Options": "nosniff",
          },
        },
      );
    }
  },
};

export default worker;
