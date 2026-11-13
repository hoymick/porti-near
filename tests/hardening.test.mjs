import test from "node:test";
import assert from "node:assert/strict";
import { load, database } from "./helpers/services.mjs";
import { DomainError } from "../lib/errors.mjs";
import { assertTransferSourceRole } from "../lib/review-wallet.mjs";
import {
  checkOrigin,
  readJSON,
  responseJSON,
  consumeLimit,
} from "../lib/request-guard.mjs";
import * as near from "../lib/near-core.mjs";
import { candles, reading } from "../lib/chart-core.mjs";
import { username } from "../lib/near-identity.mjs";
const request = (body, headers = {}) =>
  new Request("https://porti.example/api/porti", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Origin: "https://porti.example",
      ...headers,
    },
    body,
  });
test("JSON writes require same origin and content type; private service calls have an explicit separate path", () => {
  checkOrigin(request("{}"));
  assert.throws(() =>
    checkOrigin(request("{}", { Origin: "https://evil.example" })),
  );
  assert.throws(() =>
    checkOrigin(request("{}", { "Content-Type": "text/plain" })),
  );
  const r = new Request("https://porti.example/api/porti", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: "{}",
  });
  assert.throws(() => checkOrigin(r));
  checkOrigin(r, { service: true });
});
test("request limits count UTF-8 bytes, reject malformed and non-object JSON, and bound streamed bodies", async () => {
  await assert.rejects(readJSON(request("null")));
  await assert.rejects(readJSON(request("[]")));
  await assert.rejects(readJSON(request("{")));
  await assert.rejects(
    readJSON(request(JSON.stringify({ x: "🟢".repeat(30) })), 100),
    (e) => e.status === 413,
  );
  await assert.rejects(
    readJSON(request("{}", { "Content-Length": "99999" })),
    (e) => e.status === 413,
  );
  const body = new ReadableStream({
    start(c) {
      c.enqueue(new Uint8Array(500));
      c.enqueue(new Uint8Array(500));
      c.close();
    },
  });
  await assert.rejects(
    readJSON(
      new Request("https://porti.example", {
        method: "POST",
        body,
        duplex: "half",
      }),
      600,
    ),
    (e) => e.status === 413,
  );
});
test("oversized and invalid provider bodies never enter application state", async () => {
  await assert.rejects(
    responseJSON(Response.json({ x: "x".repeat(500) }), 100),
    (e) => e.code === "PROVIDER_RESPONSE",
  );
  await assert.rejects(
    responseJSON(new Response("not json")),
    (e) => e.code === "PROVIDER_RESPONSE",
  );
  assert.deepEqual(await responseJSON(Response.json({ ok: true })), {
    ok: true,
  });
});
test("durable quotas remain atomic under concurrency and survive handler recreation", async () => {
  const { sql, adapter } = database();
  const now = 1793790000000;
  const results = await Promise.allSettled(
    Array.from({ length: 20 }, () =>
      consumeLimit(adapter, "a", "research", 3, 60000, now),
    ),
  );
  assert.equal(results.filter((x) => x.status === "fulfilled").length, 3);
  await assert.rejects(
    consumeLimit(adapter, "a", "research", 3, 60000, now),
    (e) => e.status === 429 && e.retryAfter > 0,
  );
  await consumeLimit(adapter, "b", "research", 3, 60000, now);
  await consumeLimit(adapter, "a", "research", 3, 60000, now + 60000);
  sql.close();
});
const hash = "A".repeat(44),
  receiptId = "B".repeat(44);
function evidence(token = "near") {
  const transaction = near.buildTransfer({
      sender: "alice.near",
      recipient: "bob.near",
      token,
      rawAmount: "100",
      decimals: 24,
    }),
    draft = {
      sender: "alice.near",
      recipient: "bob.near",
      rawAmount: "100",
      token,
      transaction,
    };
  const a = transaction.actions[0],
    action =
      a.type === "Transfer"
        ? { Transfer: { deposit: "100" } }
        : {
            FunctionCall: {
              method_name: a.params.methodName,
              deposit: a.params.deposit,
              gas: a.params.gas,
              args: Buffer.from(JSON.stringify(a.params.args), "utf8").toString(
                "base64",
              ),
            },
          };
  const result = {
    final_execution_status: "FINAL",
    status: { SuccessValue: "" },
    transaction: {
      hash,
      signer_id: "alice.near",
      receiver_id: transaction.receiverId,
      actions: [action],
    },
    transaction_outcome: {
      id: hash,
      block_hash: "C".repeat(44),
      outcome: {
        receipt_ids: [receiptId],
        status: { SuccessReceiptId: receiptId },
      },
    },
    receipts_outcome: [
      {
        id: receiptId,
        outcome: {
          executor_id: token === "near" ? "bob.near" : token,
          receipt_ids: [],
          status: { SuccessValue: "" },
          logs:
            token === "near"
              ? []
              : [
                  "EVENT_JSON:" +
                    JSON.stringify({
                      standard: "nep141",
                      version: "1.0.0",
                      event: "ft_transfer",
                      data: [
                        {
                          old_owner_id: "alice.near",
                          new_owner_id: "bob.near",
                          amount: "100",
                        },
                      ],
                    }),
                ],
        },
      },
    ],
  };
  return { draft, result };
}
test("transfer proof rejects optimistic status, wrong hashes, missing receipts and descendant failures", () => {
  const { draft, result } = evidence();
  assert.equal(near.finalTransferEvidence(result, draft, hash), true);
  for (const status of [
    "NONE",
    "INCLUDED_FINAL",
    "EXECUTED",
    "EXECUTED_OPTIMISTIC",
  ])
    assert.equal(
      near.finalTransferEvidence(
        { ...result, final_execution_status: status },
        draft,
        hash,
      ),
      false,
    );
  assert.equal(
    near.finalTransferEvidence(
      {
        ...result,
        transaction: { ...result.transaction, hash: "D".repeat(44) },
      },
      draft,
      hash,
    ),
    false,
  );
  assert.equal(
    near.finalTransferEvidence(
      { ...result, receipts_outcome: [] },
      draft,
      hash,
    ),
    false,
  );
  const failure = structuredClone(result);
  failure.receipts_outcome[0].outcome.status = { Failure: { error: "failed" } };
  assert.equal(near.finalTransferEvidence(failure, draft, hash), false);
  const missing = structuredClone(result);
  missing.receipts_outcome[0].outcome.receipt_ids = ["D".repeat(44)];
  assert.equal(near.finalTransferEvidence(missing, draft, hash), false);
});
test("FT receipt proof requires the matching token-contract NEP-141 transfer event", () => {
  const { draft, result } = evidence("wrap.near");
  assert(near.finalTransferEvidence(result, draft, hash));
  for (const change of [
    (r) => (r.receipts_outcome[0].outcome.logs = []),
    (r) => (r.receipts_outcome[0].outcome.executor_id = "fake.near"),
    (r) =>
      (r.receipts_outcome[0].outcome.logs[0] =
        r.receipts_outcome[0].outcome.logs[0].replace(
          "bob.near",
          "mallory.near",
        )),
    (r) =>
      (r.receipts_outcome[0].outcome.logs[0] =
        r.receipts_outcome[0].outcome.logs[0].replace("100", "101")),
  ]) {
    const r = structuredClone(result);
    change(r);
    assert.equal(near.finalTransferEvidence(r, draft, hash), false);
  }
});
test("gas reserve tracks the live gas price and number of token calls with a safety buffer", () => {
  assert.equal(near.gasReserve("100000000", "near"), "2000000000000000000000");
  assert.equal(
    near.gasReserve("100000000", "wrap.near"),
    "6200000000000000000000",
  );
  assert.equal(
    near.gasReserve("100000000", "wrap.near", "100"),
    "12200000000000000000000",
  );
  assert.throws(() => near.gasReserve("0"));
  assert.throws(() => near.gasReserve("1e8"));
});
test("a block between membership lookup and message fetch revokes the actual read", async () => {
  let race = false;
  const { sql, adapter } = database({
    beforeAll(q, v, sql) {
      if (race && q.includes("SELECT m.id"))
        sql
          .prepare("UPDATE friend_links SET status='blocked',blocker='b'")
          .run();
    },
  });
  for (const [u, o] of [
    ["alice", "a"],
    ["bob", "b"],
  ])
    sql
      .prepare("INSERT INTO profiles VALUES(?,?,?,?,?)")
      .run(u, o, o + ".near", 0, "v");
  const s = load(
    "lib/friends.ts",
    { env: { DB: adapter }, DomainError, username },
    ["friendAction", "friendsState"],
  );
  await s.friendAction("a", { action: "request", username: "bob" });
  const pair = (await s.friendsState("a")).links[0].pair;
  await s.friendAction("b", { action: "accept", pair });
  await s.friendAction("a", {
    action: "send",
    pair,
    id: "message-12345",
    text: "Private",
  });
  race = true;
  assert.deepEqual((await s.friendsState("a", pair)).messages, []);
  sql.close();
});
test("recipient request caps are enforced in the insert, not only the preflight count", async () => {
  const { sql, adapter } = database();
  for (let i = 0; i < 52; i++)
    sql
      .prepare("INSERT INTO profiles VALUES(?,?,?,?,?)")
      .run("user" + i, "id" + i, "u" + i + ".near", 0, "v");
  for (let i = 1; i <= 50; i++)
    sql
      .prepare("INSERT INTO friend_links VALUES(?,?,?,?,?,NULL,0)")
      .run("pair" + i, "id0", "id" + i, "id" + i, "pending");
  const s = load(
    "lib/friends.ts",
    { env: { DB: adapter }, DomainError, username },
    ["friendAction"],
  );
  await assert.rejects(
    s.friendAction("id51", { action: "request", username: "user0" }),
  );
  sql.close();
});
test("receipt uniqueness is durable across workspace history eviction", async () => {
  const { sql, adapter } = database();
  await adapter
    .prepare("INSERT INTO porti_transfer_receipts VALUES(?,?,?,?,?,?)")
    .bind("one", "a", hash, "review-one", "{}", 0)
    .run();
  await assert.rejects(
    adapter
      .prepare("INSERT INTO porti_transfer_receipts VALUES(?,?,?,?,?,?)")
      .bind("two", "a", hash, "review-two", "{}", 0)
      .run(),
  );
  await assert.rejects(
    adapter
      .prepare("INSERT INTO porti_transfer_receipts VALUES(?,?,?,?,?,?)")
      .bind("three", "a", "D".repeat(44), "review-one", "{}", 0)
      .run(),
  );
  await adapter
    .prepare("INSERT INTO porti_transfer_receipts VALUES(?,?,?,?,?,?)")
    .bind("four", "b", hash, "review-one", "{}", 0)
    .run();
  sql.close();
});

function profileService(race = false) {
  let clock = Date.now();
  let arm = false;
  const { sql, adapter } = database({
    beforeBatch(sql) {
      if (race && arm) {
        arm = false;
        sql.prepare("DELETE FROM profiles WHERE owner_id='a'").run();
        sql
          .prepare(
            "UPDATE workspaces SET state=json_remove(state,'$.porti.profileChallenge') WHERE owner_id='a'",
          )
          .run();
      }
    },
  });
  const challenge = {
    id: "challenge-one",
    username: "alice",
    account: "alice.near",
    expiresAt: clock + 300000,
  };
  sql
    .prepare("INSERT INTO workspaces VALUES(?,?,0,?)")
    .run(
      "a",
      JSON.stringify({ porti: { profileChallenge: challenge } }),
      clock,
    );
  const svc = load(
    "lib/near-profile.ts",
    {
      env: { DB: adapter },
      DomainError,
      username,
      nearAccountOK: near.nearAccountOK,
      verifyNearMessage: async () => true,
      initialPorti: () => ({}),
      readWorkspace: async () => ({
        state: JSON.parse(
          sql.prepare("SELECT state FROM workspaces WHERE owner_id='a'").get()
            .state,
        ),
      }),
      mutate: async () => {
        throw Error("Proof consumption must use an atomic batch");
      },
      nearRpc: async () => ({
        keys: [{ public_key: "key", access_key: { permission: "FullAccess" } }],
      }),
      Date: { now: () => clock },
    },
    ["verifyProfile", "unlinkProfile"],
  );
  return {
    sql,
    ...svc,
    arm: () => (arm = true),
    expire: () => (clock += 600000),
  };
}
test("profile proof consumption and username write commit atomically and reject replay", async () => {
  const s = profileService();
  const result = await Promise.allSettled([
    s.verifyProfile("a", { publicKey: "key" }),
    s.verifyProfile("a", { publicKey: "key" }),
  ]);
  assert.equal(result.filter((x) => x.status === "fulfilled").length, 1);
  assert.equal(s.sql.prepare("SELECT count(*) n FROM profiles").get().n, 1);
  assert.equal(
    JSON.parse(
      s.sql.prepare("SELECT state FROM workspaces WHERE owner_id='a'").get()
        .state,
    ).porti.profileChallenge,
    undefined,
  );
  await s.unlinkProfile("a");
  assert.equal(s.sql.prepare("SELECT count(*) n FROM profiles").get().n, 0);
  s.sql.close();
});
test("profile unlink during verification cannot resurrect a removed wallet mapping", async () => {
  const s = profileService(true);
  s.arm();
  await assert.rejects(s.verifyProfile("a", { publicKey: "key" }));
  assert.equal(s.sql.prepare("SELECT count(*) n FROM profiles").get().n, 0);
  s.sql.close();
});
test("expired profile proof cannot write a wallet mapping", async () => {
  const s = profileService();
  s.expire();
  await assert.rejects(s.verifyProfile("a", { publicKey: "key" }));
  assert.equal(s.sql.prepare("SELECT count(*) n FROM profiles").get().n, 0);
  s.sql.close();
});
import { mutateWorkspace, readWorkspace as readStore } from "../lib/store.mjs";
function transfers({
  age = 0,
  network = "mainnet",
  token = "near",
  emptyLog = false,
} = {}) {
  const { sql, adapter } = database(),
    fixture = evidence(token),
    requestedAt = Date.now();
  let state = {
    porti: {
      drafts: [
        {
          ...fixture.draft,
          id: "review-one",
          symbol: token === "near" ? "NEAR" : "wNEAR",
          amount: "0.0000000000000000000001",
          createdAt: requestedAt,
          requestedAt,
          expiresAt: requestedAt + 60000,
          status: "wallet_requested",
        },
      ],
      watches: [],
      snapshots: {},
      messages: [],
      alerts: [],
      receipts: [],
    },
  };
  sql
    .prepare("INSERT INTO workspaces VALUES(?,?,0,?)")
    .run("a", JSON.stringify(state), requestedAt);
  let calls = [];
  const services = load(
    "lib/near-services.ts",
    {
      env: { DB: adapter, PORTI_SETTINGS_KEY: "a".repeat(64) },
      assertTransferSourceRole,
      ...near,
      DomainError,
      mutate: (id, fn) => mutateWorkspace(adapter, id, fn),
      readWorkspace: (id) => readStore(adapter, id),
      tokenRisk: () => ({}),
      createHolderLookup: () => async () => ({ holders: [], fetchedAt: 0 }),
      fetch: async (url, init) => {
        const q = JSON.parse(init.body);
        calls.push(q.method);
        let result;
        if (q.method === "status") result = { chain_id: network };
        else if (q.method === "tx") {
          result = structuredClone(fixture.result);
          result.transaction.hash = q.params.tx_hash;
          result.transaction_outcome.id = q.params.tx_hash;
          if (emptyLog) result.receipts_outcome[0].outcome.logs = [];
        } else if (q.method === "block")
          result = {
            header: {
              timestamp_nanosec: String(BigInt(requestedAt - age) * 1000000n),
            },
          };
        else if (q.method === "query")
          result = {
            amount: "100000000000000000000000000",
            storage_usage: 100,
            block_hash: "C".repeat(44),
          };
        else if (q.method === "gas_price") result = { gas_price: "100000000" };
        else throw Error("Unexpected RPC method");
        return Response.json({ result });
      },
    },
    [
      "reconcileNearTransfer",
      "prepareNearTransfer",
      "validateNearDraft",
      "safePorti",
      "encryptNear",
      "decryptNear",
      "nearRpc",
    ],
  );
  return { sql, ...services, calls, read: () => readStore(adapter, "a") };
}
test("receipt verification persists final evidence and remains idempotent after workspace history eviction", async () => {
  const s = transfers();
  const r = await s.reconcileNearTransfer("a", "review-one", hash);
  assert.equal(r.finality, "FINAL");
  assert.equal(
    s.sql.prepare("SELECT COUNT(*) n FROM porti_transfer_receipts").get().n,
    1,
  );
  s.sql
    .prepare(
      "UPDATE workspaces SET state=json_set(state,'$.porti.drafts',json('[]'),'$.porti.receipts',json('[]'))",
    )
    .run();
  assert.equal(
    (await s.reconcileNearTransfer("a", "review-one", hash)).hash,
    hash,
  );
  await assert.rejects(
    s.reconcileNearTransfer("a", "another-review", hash),
    (e) => e.code === "HASH_USED",
  );
  await assert.rejects(s.reconcileNearTransfer("b", "review-one", hash));
  s.sql.close();
});
test("old transactions and successful FT calls without transfer events cannot create receipts", async () => {
  const old = transfers({ age: 60000 });
  await assert.rejects(
    old.reconcileNearTransfer("a", "review-one", hash),
    (e) => e.code === "TRANSACTION_TIME",
  );
  assert.equal(
    old.sql.prepare("SELECT COUNT(*) n FROM porti_transfer_receipts").get().n,
    0,
  );
  old.sql.close();
  const ft = transfers({ token: "wrap.near", emptyLog: true });
  await assert.rejects(
    ft.reconcileNearTransfer("a", "review-one", hash),
    (e) => e.code === "TRANSFER_UNVERIFIED",
  );
  ft.sql.close();
});
test("concurrent transaction hashes cannot finalize the same review twice", async () => {
  const s = transfers();
  const r = await Promise.allSettled([
    s.reconcileNearTransfer("a", "review-one", hash),
    s.reconcileNearTransfer("a", "review-one", "E".repeat(44)),
  ]);
  assert.equal(r.filter((x) => x.status === "fulfilled").length, 1);
  assert.equal(
    s.sql.prepare("SELECT COUNT(*) n FROM porti_transfer_receipts").get().n,
    1,
  );
  s.sql.close();
});
test("transfer preparation retries return one review and approval can only be requested once", async () => {
  const s = transfers();
  const input = {
    requestId: "request-id-12345",
    sender: "alice.near",
    recipient: "bob.near",
    token: "near",
    amount: "1",
    denomination: "token",
  };
  const drafts = await Promise.all([
    s.prepareNearTransfer("a", input),
    s.prepareNearTransfer("a", input),
  ]);
  assert.equal(drafts[0].id, drafts[1].id);
  await assert.rejects(
    s.prepareNearTransfer("a", { ...input, amount: "2" }),
    (e) => e.code === "REQUEST_REUSED",
  );
  const approvals = await Promise.allSettled([
    s.validateNearDraft("a", drafts[0].id),
    s.validateNearDraft("a", drafts[0].id),
  ]);
  assert.equal(approvals.filter((x) => x.status === "fulfilled").length, 1);
  const stored = (await s.read()).state.porti.drafts.find(
    (d) => d.id === drafts[0].id,
  );
  assert.ok(stored.requestedAt);
  s.sql.close();
});
test("role-bound drafts preserve the source and reject unlinked or changed roles before approval", async () => {
  const s = transfers();
  const input = {requestId:"role-transfer-12345",sender:"alice.near",senderRole:"agent",recipient:"bob.near",token:"near",amount:"0.1",denomination:"token"};
  await assert.rejects(s.prepareNearTransfer("a",input),e=>e.code==="SOURCE_WALLET_CHANGED");
  assert.equal(s.calls.length,0);
  s.sql.prepare("UPDATE workspaces SET state=json_set(state,'$.porti.walletRoles',json(?))").run(JSON.stringify({agent:{account:"alice.near",verifiedAt:1}}));
  const draft = await s.prepareNearTransfer("a",input);
  assert.equal(draft.senderRole,"agent");assert.equal(draft.sender,"alice.near");
  await assert.rejects(s.prepareNearTransfer("a",{...input,senderRole:"main"}),e=>e.code==="REQUEST_REUSED");
  s.sql.prepare("UPDATE workspaces SET state=json_set(state,'$.porti.walletRoles.agent.account','other.near')").run();
  await assert.rejects(s.validateNearDraft("a",draft.id),e=>e.code==="SOURCE_WALLET_CHANGED");
  assert.equal((await s.read()).state.porti.drafts.find(d=>d.id===draft.id).status,"awaiting_review");
  s.sql.close();
});
test("provider requests cannot silently switch to a testnet endpoint", async () => {
  const s = transfers({ network: "testnet" });
  await assert.rejects(
    s.nearRpc("a", "query", { account_id: "alice.near" }),
    (e) => e.code === "WRONG_NETWORK",
  );
  assert.deepEqual(s.calls, ["status"]);
  s.sql.close();
});
test("encrypted settings are owner-bound, randomized and absent from allowlisted public state", async () => {
  const s = transfers();
  const one = await s.encryptNear("test-provider-value", "a"),
    two = await s.encryptNear("test-provider-value", "a");
  assert.notDeepEqual(one.iv, two.iv);
  assert.equal(await s.decryptNear(one, "a"), "test-provider-value");
  await assert.rejects(
    s.decryptNear(one, "b"),
    (e) => e.code === "SETTINGS_LOCKED",
  );
  const visible = s.safePorti({
    porti: {
      drafts: [],
      watches: [],
      alerts: [],
      messages: [],
      receipts: [],
      aiKeyCipher: one,
      futureSecret: "do-not-return",
      walletChallenge: { nonce: "private" },
    },
  });
  assert.equal(visible.futureSecret, undefined);
  assert.equal(visible.walletChallenge, undefined);
  assert.equal(visible.aiKeyCipher, undefined);
  s.sql.close();
});

test("a damaged AI credential does not break unrelated mainnet reads", async () => {
  const s = transfers();
  s.sql
    .prepare(
      "UPDATE workspaces SET state=json_set(state,'$.porti.aiKeyCipher',json('{}')) WHERE owner_id='a'",
    )
    .run();
  assert.equal((await s.nearRpc("a", "status", [])).chain_id, "mainnet");
  s.sql.close();
});

test("market refresh deduplicates concurrent reads and serves visibly stale cached data during rate limits", async () => {
  let clock = 1793790000000,
    calls = 0,
    fail = false,
    release;
  const gate = new Promise((r) => (release = r));
  const rows = Array.from({ length: 60 }, (_, i) => [
    100000 + i * 3600,
    1,
    2,
    0.5,
    1.5,
    5,
  ]);
  const s = load(
    "lib/token-chart.ts",
    {
      ...near,
      candles,
      reading,
      DomainError,
      Date: { now: () => clock },
      fetch: async (url) => {
        calls++;
        if (fail)
          return Response.json({ error: "rate limited" }, { status: 429 });
        if (url.includes("/tokens/")) {
          await gate;
          return Response.json({
            data: [
              {
                id: "near_pool",
                attributes: { reserve_in_usd: "100", name: "NEAR" },
                relationships: {
                  base_token: { data: { id: "near_wrap.near" } },
                },
              },
            ],
          });
        }
        return Response.json({ data: { attributes: { ohlcv_list: rows } } });
      },
    },
    ["tokenChart"],
  );
  const first = s.tokenChart("wrap.near"),
    second = s.tokenChart("wrap.near");
  release();
  await Promise.all([first, second]);
  assert.equal(calls, 2);
  clock += 60000;
  fail = true;
  const stale = await s.tokenChart("wrap.near");
  assert.equal(stale.stale, true);
  assert.ok(stale.refreshError);
  assert.equal(calls, 3);
  await s.tokenChart("wrap.near");
  assert.equal(calls, 3);
});
