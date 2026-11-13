import test from "node:test";
import assert from "node:assert/strict";
import { createNearAIClient } from "../lib/near-ai.mjs";
import { DomainError } from "../lib/errors.mjs";
import { load } from "./helpers/services.mjs";
import { transferChatIntent, transferChatReply } from "../lib/transfer-chat.mjs";
import { walletChatState } from "../lib/wallet-connection.mjs";
import { displayChatText } from "../lib/chat-format.mjs";

const payload = { model: "chosen/model", messages: [{ role: "user", content: "Explain Porti." }], max_tokens: 100 };
const answer = () => Response.json({ choices: [{ message: { content: "A real answer" } }] });
const failure = (status, type, headers = {}) => Response.json({ error: { type, message: "secret-key-and-private-input" } }, { status, headers });
function fixture(responses, options = {}) {
  const requests = [], delays = [];
  const client = createNearAIClient({
    fetchImpl: async (url, init) => {
      requests.push({ url, ...init });
      const result = responses.shift();
      if (result instanceof Error) throw result;
      return typeof result === "function" ? result(init) : result;
    },
    sleep: async ms => { delays.push(ms); },
    ...options,
  });
  return { client, requests, delays };
}
test("a transient failure retries only the identical inference on the selected model", async () => {
  const f = fixture([failure(503, "service_overloaded"), answer()]);
  assert.equal((await f.client("test-key", payload)).choices[0].message.content, "A real answer");
  assert.equal(f.requests.length, 2);
  assert.deepEqual(f.delays, [1000]);
  assert.equal(f.requests[0].body, f.requests[1].body);
  for (const r of f.requests) {
    assert.equal(r.url, "https://cloud-api.near.ai/v1/chat/completions");
    assert.equal(r.headers.Authorization, "Bearer test-key");
    assert.equal(r.redirect, "manual");
    assert.equal(JSON.parse(r.body).model, payload.model);
    assert.equal(JSON.parse(r.body).stream, false);
    assert.ok(r.signal instanceof AbortSignal);
  }
});
test("retry cap is two attempts, even during persistent overload", async () => {
  const f = fixture([failure(503), failure(503), answer()]);
  await assert.rejects(f.client("test-key", payload), e => e.code === "AI_BUSY" && !e.message.includes("secret-key"));
  assert.equal(f.requests.length, 2);
});
test("rate-limit Retry-After seconds and dates are respected without a long blocking retry", async () => {
  for (const value of ["60", new Date(61000).toUTCString()]) {
    const f = fixture([failure(429, "rate_limit_exceeded", { "Retry-After": value })], { now: () => 1000 });
    await assert.rejects(f.client("test-key", payload), e => e.code === "AI_RATE_LIMIT" && /60 seconds/.test(e.message));
    assert.equal(f.requests.length, 1); assert.deepEqual(f.delays, []);
  }
  const f = fixture([failure(429, "service_overloaded", { "Retry-After": "2" }), answer()]);
  await f.client("test-key", payload); assert.deepEqual(f.delays, [2000]);
});
test("credentials, credits, model and rejected requests never retry or echo raw provider text", async () => {
  for (const [status, type, code] of [[401,"","AI_ACCESS"],[403,"","AI_ACCESS"],[402,"","AI_CREDITS"],[429,"insufficient_quota","AI_CREDITS"],[400,"model_not_found","AI_MODEL"],[404,"","AI_MODEL"],[400,"","AI_REQUEST"],[302,"","AI_REQUEST"]]) {
    const f = fixture([failure(status, type)]);
    await assert.rejects(f.client("test-key", payload), e => e.code === code && !e.message.includes("secret-key-and-private-input"));
    assert.equal(f.requests.length, 1); assert.deepEqual(f.delays, []);
  }
});
test("network failures retry once, but ambiguous timeouts do not resend inference", async () => {
  const f = fixture([new TypeError("private network details"), answer()]);
  await f.client("test-key", payload); assert.equal(f.requests.length, 2);
  const timeout = fixture([new DOMException("secret", "TimeoutError")]);
  await assert.rejects(timeout.client("test-key", payload), e => e.code === "AI_TIMEOUT");
  assert.equal(timeout.requests.length, 1);
  const offline = fixture([new TypeError("secret"), new TypeError("secret")]);
  await assert.rejects(offline.client("test-key", payload), e => e.code === "AI_NETWORK" && !e.message.includes("secret"));
});
test("text and image requests use the same timeout policy and share a total retry budget", async () => {
  for (const content of ["text", [{ type: "image_url", image_url: { url: "data:image/png;base64,AA==" } }]]) {
    const f = fixture([init => new Promise((resolve, reject) => {
      // Keep a referenced timer for the short test; the actual fetch respects
      // AbortSignal for both headers and body reads.
      const timer = setTimeout(() => resolve(answer()), 50);
      init.signal.addEventListener("abort", () => { clearTimeout(timer); reject(init.signal.reason); }, { once: true });
    })], { requestTimeoutMs: 5 });
    await assert.rejects(f.client("test-key", { ...payload, messages: [{ role: "user", content }] }), e => e.code === "AI_TIMEOUT");
    assert.equal(f.requests.length, 1);
  }
  let clock = 0;
  const f = fixture([() => { clock = 59900; return failure(503); }], { now: () => clock });
  await assert.rejects(f.client("test-key", payload), e => e.code === "AI_BUSY");
  assert.equal(f.requests.length, 1);
});
test("invalid, empty, reasoning-only and oversized completions fail without repeated billing", async () => {
  for (const r of [new Response("not-json"), Response.json({ choices: [] }), Response.json({ choices: [{ message: { content: "", reasoning_content: "internal" } }] }), Response.json({ x: "x".repeat(2000001) })]) {
    const f = fixture([r]);
    await assert.rejects(f.client("test-key", payload), e => ["AI_RESPONSE", "AI_EMPTY_RESPONSE"].includes(e.code));
    assert.equal(f.requests.length, 1);
  }
});
test("a valid tool-only completion is accepted without running a tool in the HTTP client", async () => {
  const tool = { id: "call-1", type: "function", function: { name: "inspect_account", arguments: '{"account":"alice.near"}' } };
  const f = fixture([Response.json({ choices: [{ message: { content: null, tool_calls: [tool] } }] })]);
  assert.deepEqual((await f.client("test-key", payload)).choices[0].message.tool_calls, [tool]);
  assert.equal(f.requests.length, 1);
});

function agentFixture({ partial = false } = {}) {
  const state = { porti: { messages: [], walletRoles: {}, lastChat: 0 } };
  let calls = 0, toolCalls = 0;
  const api = load("lib/near-agent.ts", {
    DomainError, transferChatIntent, transferChatReply, walletChatState, displayChatText,
    purchaseIntent: () => null, createRheaPriceLookup: () => () => {}, nearAccountOK: () => true,
    initialPorti: () => state.porti,
    mutate: async (id, fn) => ({ result: await fn(state) }),
    portiConfig: async () => ({ aiKey: "test-key", p: state.porti }),
    nearAICompletion: async () => {
      calls++;
      if (partial && calls === 1) return { choices: [{ message: { content: null, tool_calls: [{ id: "call1", type: "function", function: { name: "inspect_account", arguments: '{"account":"alice.near"}' } }] } }] };
      throw new DomainError("AI_BUSY", "NEAR AI Cloud is temporarily busy.", 503);
    },
    nearTool: async () => { toolCalls++; return { output: { balance: "1" }, card: { type: "observation", snapshot: { account: "alice.near" } } }; },
  }, ["nearChat"]);
  return { ...api, state, calls: () => calls, toolCalls: () => toolCalls };
}
test("a failed final explanation preserves real cards and replay does not rerun the tool", async () => {
  const f = agentFixture({ partial: true }), input = { message: "Inspect alice.near", wallet: "alice.near", requestId: "test-card-retention-123" };
  const result = await f.nearChat("owner", input);
  assert.equal(result.cards[0].snapshot.account, "alice.near");
  assert.match(result.reply.content, /explanation could not finish/);
  assert.ok(result.reply.steps.some(s => s.tool === "ai_explanation" && s.status === "failed"));
  assert.equal(f.state.porti.chatLock, undefined);
  assert.deepEqual(await f.nearChat("owner", input), result);
  assert.equal(f.toolCalls(), 1); assert.equal(f.calls(), 2);
});
test("first inference failure releases the chat lock and exposes the precise safe error", async () => {
  const f = agentFixture();
  await assert.rejects(f.nearChat("owner", { message: "Explain Porti", wallet: "alice.near", requestId: "test-first-failure-123" }), e => e.code === "AI_BUSY");
  assert.equal(f.state.porti.chatLock, undefined); assert.equal(f.toolCalls(), 0);
  assert.equal(f.state.porti.messages.filter(m => m.role === "assistant").length, 0);
});
