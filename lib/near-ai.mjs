import { DomainError } from "./errors.mjs";
import { responseJSON } from "./request-guard.mjs";

const endpoint = "https://cloud-api.near.ai/v1/chat/completions";
const transient = new Set([429, 500, 502, 503, 504]);

function retryDelay(value, now) {
  if (!value) return 1000;
  const seconds = Number(value);
  const ms = Number.isFinite(seconds) ? seconds * 1000 : Date.parse(value) - now;
  return Number.isFinite(ms) ? Math.max(0, ms) : 1000;
}

function providerError(status, type, delay) {
  if (status === 401 || status === 403)
    return new DomainError("AI_ACCESS", "NEAR AI Cloud rejected this key or its permissions. Check your key in Connections.", 503);
  if (status === 402 || ["insufficient_quota", "insufficient_balance", "insufficient_credits", "budget_exceeded"].includes(type))
    return new DomainError("AI_CREDITS", "NEAR AI Cloud reports insufficient credits or a spending limit. Check your balance and limits in NEAR AI Cloud.", 503);
  if (status === 429) {
    const seconds = Math.max(1, Math.ceil(delay / 1000));
    return new DomainError(type === "service_overloaded" ? "AI_BUSY" : "AI_RATE_LIMIT",
      `NEAR AI Cloud ${type === "service_overloaded" ? "is at capacity" : "is limiting requests"}. Try again in ${seconds} seconds.`, 503);
  }
  if (status === 404 || ["model_not_found", "invalid_model"].includes(type))
    return new DomainError("AI_MODEL", "NEAR AI Cloud could not find the selected model. Check the model in Connections.", 503);
  if (status >= 500)
    return new DomainError("AI_BUSY", "NEAR AI Cloud is temporarily having trouble serving this model. Try again shortly.", 503);
  return new DomainError("AI_REQUEST", "NEAR AI Cloud could not accept this request. Try a shorter message, or check the selected model in Connections.", 503);
}

// Retry inference only. Tool execution and wallet actions must stay outside this
// boundary. At most one retry, same model, and no redirects carrying credentials.
export function createNearAIClient({
  fetchImpl = (...args) => fetch(...args),
  sleep = ms => new Promise(resolve => setTimeout(resolve, ms)),
  now = Date.now,
  requestTimeoutMs = 45000,
  totalTimeoutMs = 60000,
} = {}) {
  return async function completion(apiKey, payload) {
    const body = JSON.stringify({ ...payload, stream: false });
    const deadline = now() + totalTimeoutMs;
    for (let attempt = 0; attempt < 2; attempt++) {
      const remaining = deadline - now();
      if (remaining <= 0)
        throw new DomainError("AI_TIMEOUT", "NEAR AI Cloud took too long to respond. Try a shorter message or try again shortly.", 503);
      const signal = AbortSignal.timeout(Math.min(requestTimeoutMs, remaining));
      let response;
      try {
        response = await fetchImpl(endpoint, {
          method: "POST", redirect: "manual", signal,
          headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" }, body,
        });
      } catch (error) {
        // An ambiguous timeout may already have consumed inference credits. Do
        // not automatically send it again, and never expose raw exceptions.
        if (signal.aborted || ["TimeoutError", "AbortError"].includes(error?.name))
          throw new DomainError("AI_TIMEOUT", "NEAR AI Cloud took too long to respond. Try a shorter message or try again shortly.", 503);
        if (!attempt && deadline - now() > 2000) { await sleep(1000); continue; }
        throw new DomainError("AI_NETWORK", "Porti could not reach NEAR AI Cloud. Try again shortly; your saved key has not been removed.", 503);
      }
      if (!response.ok) {
        let type = "";
        try {
          const data = await responseJSON(response, 16384);
          // Read only machine codes. Provider messages can contain request data
          // or secrets and must never be echoed, persisted, or logged.
          const codes = [data.error?.type, data.error?.code];
          type = codes.find(c => ["insufficient_quota", "insufficient_balance", "insufficient_credits", "budget_exceeded", "model_not_found", "invalid_model", "service_overloaded"].includes(c)) || "";
        } catch { /* An HTML error page must still retain its HTTP category. */ }
        const delay = retryDelay(response.headers.get("retry-after"), now());
        const error = providerError(response.status, type, delay);
        if (!attempt && transient.has(response.status) && !["AI_CREDITS", "AI_MODEL"].includes(error.code)
          && delay <= 3000 && deadline - now() > delay + 1000) {
          await sleep(delay); continue;
        }
        throw error;
      }
      let data;
      try { data = await responseJSON(response); }
      catch {
        throw new DomainError(signal.aborted ? "AI_TIMEOUT" : "AI_RESPONSE",
          signal.aborted ? "NEAR AI Cloud took too long to finish its response. Try again shortly." : "NEAR AI Cloud returned an unreadable response. Try again shortly.", 503);
      }
      const message = data.choices?.[0]?.message;
      const text = typeof message?.content === "string" && message.content.trim();
      const calls = Array.isArray(message?.tool_calls) && message.tool_calls.length > 0
        && message.tool_calls.every(c => typeof c?.id === "string" && c.type === "function"
          && typeof c.function?.name === "string" && typeof c.function?.arguments === "string");
      if (!text && !calls)
        throw new DomainError("AI_EMPTY_RESPONSE", "NEAR AI Cloud returned no usable answer. Try a shorter message or check the selected model in Connections.", 503);
      return data;
    }
  };
}

export const nearAICompletion = createNearAIClient();
