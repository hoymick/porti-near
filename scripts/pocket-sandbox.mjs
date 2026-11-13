// Local Porti Pocket on a NEAR sandbox chain. Free and private: nothing touches mainnet.
//   (cd contracts/pocket && cargo near build non-reproducible-wasm)
//   npm run pocket:sandbox
// Starts a sandbox on 127.0.0.1:3030, creates alice.sandbox (main wallet) and
// bob.sandbox (recipient), runs the real one-transaction pocket setup, links the
// +999000001 simulator number in local D1, and keeps the chain running until Ctrl-C.
// Then run `npm run dev` with PORTI_USSD_RPC=http://127.0.0.1:3030 in .dev.vars.
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { Sandbox, DEFAULT_ACCOUNT_ID, DEFAULT_PRIVATE_KEY } from "near-sandbox";
import { Account, JsonRpcProvider, KeyPair, actions } from "near-api-js";

const root = resolve(import.meta.dirname, "..");
const PORT = Number(process.env.SANDBOX_PORT || 3030);
const PHONE = process.env.SIM_PHONE || "+999000001";
const PIN = process.env.SIM_PIN || "1234"; // demo PIN for the simulator number only
const near = (n) => BigInt(Math.round(n * 1e6)) * 10n ** 18n;
const TGAS = 10n ** 12n;

const wasmPath = join(root, "contracts/pocket/target/near/porti_pocket.wasm");
if (!existsSync(wasmPath)) {
  console.error("Build the contract first: (cd contracts/pocket && cargo near build non-reproducible-wasm)");
  process.exit(1);
}

console.log(`Starting NEAR sandbox on 127.0.0.1:${PORT} (first run downloads the node binary)...`);
const sandbox = await Sandbox.start({ config: { rpcPort: PORT } });
const stop = async () => {
  await sandbox.tearDown().catch(() => {});
  process.exit(0);
};
process.on("SIGINT", stop);
process.on("SIGTERM", stop);

try {
  const provider = new JsonRpcProvider({ url: sandbox.rpcUrl });
  const genesis = new Account(DEFAULT_ACCOUNT_ID, provider, DEFAULT_PRIVATE_KEY);
  const keys = { alice: KeyPair.fromRandom("ed25519"), bob: KeyPair.fromRandom("ed25519"), server: KeyPair.fromRandom("ed25519") };
  const ids = { alice: `alice.${DEFAULT_ACCOUNT_ID}`, bob: `bob.${DEFAULT_ACCOUNT_ID}` };
  ids.pocket = `pocket.${ids.alice}`;

  await genesis.createAccount({ newAccountId: ids.alice, publicKey: keys.alice.getPublicKey(), nearToTransfer: near(20) });
  await genesis.createAccount({ newAccountId: ids.bob, publicKey: keys.bob.getPublicKey(), nearToTransfer: near(1) });

  // The pocket setup exactly as the web flow will do it: one transaction signed
  // by the main wallet. The pocket ends with no full-access key.
  const alice = new Account(ids.alice, provider, keys.alice.toString());
  await alice.signAndSendTransaction({
    receiverId: ids.pocket,
    actions: [
      actions.createAccount(),
      actions.transfer(near(2.5)), // ~1.35 storage for the code + 1 spendable + reserve
      actions.deployContract(new Uint8Array(readFileSync(wasmPath))),
      actions.functionCall(
        "new",
        { owner_id: ids.alice, per_tx_cap: near(0.1).toString(), daily_cap: near(0.3).toString() },
        30n * TGAS,
        0n,
      ),
      actions.addFunctionCallAccessKey(keys.server.getPublicKey(), ids.pocket, ["send", "freeze"], near(0.25)),
    ],
  });

  const pocket = await provider.callFunction({ contractId: ids.pocket, method: "get_pocket", args: {} });
  const accessKeys = await provider.viewAccessKeyList({ accountId: ids.pocket });

  // Local secrets stay under .wrangler/ (gitignored). The server key is what the
  // USSD Send flow will sign with.
  mkdirSync(join(root, ".wrangler"), { recursive: true });
  const statePath = join(root, ".wrangler/pocket-sandbox.json");
  writeFileSync(statePath, JSON.stringify({
    rpc: sandbox.rpcUrl, phone: PHONE, ...ids,
    serverKey: keys.server.toString(), aliceKey: keys.alice.toString(),
  }, null, 2), { mode: 0o600 });

  const d1 = (...a) => spawnSync(process.execPath, [join(root, "scripts/d1-local.mjs"), ...a], { cwd: root, encoding: "utf8" });
  const link = d1("link-sim", PHONE, ids.pocket, PIN);
  const named = d1("username", "bob", ids.bob);

  console.log(`
Sandbox ready at ${sandbox.rpcUrl}
  main wallet   ${ids.alice}
  pocket        ${ids.pocket}   per-tx 0.1 NEAR, daily 0.3 NEAR
  recipient     ${ids.bob}
  pocket keys   ${accessKeys.keys.map((k) => `${k.public_key.slice(0, 16)}... ${k.access_key.permission === "FullAccess" ? "FULL ACCESS" : "function-call: " + k.access_key.permission.FunctionCall.method_names.join(",")}`).join("; ")}
  get_pocket    ${JSON.stringify(pocket)}
  simulator     ${PHONE} -> ${ids.pocket} ${link.status === 0 ? `(linked in local D1, PIN ${PIN})` : "(link FAILED: run npm run db:local -- migrate)"}
  username      @bob -> ${ids.bob} ${named.status === 0 ? "(local profile)" : "(FAILED)"}
  state         ${statePath}

Next: put these in .dev.vars, restart npm run dev, then dial (or use Phone pocket in the app):
  PORTI_USSD_RPC=${sandbox.rpcUrl}
  PORTI_POCKET_KEY=<serverKey from ${statePath}>
  curl -X POST http://127.0.0.1:5173/api/ussd/sim -d 'sessionId=s1&serviceCode=*384*1%23&phoneNumber=%2B999000001&text='
  curl -X POST http://127.0.0.1:5173/api/ussd/sim -d 'sessionId=s1&serviceCode=*384*1%23&phoneNumber=%2B999000001&text=1'
  Send: 2, then bob, then 0.05, then ${PIN}

Ctrl-C stops the chain.`);
} catch (e) {
  console.error("Sandbox setup failed:", e?.message || e);
  await sandbox.tearDown().catch(() => {});
  process.exit(1);
}
