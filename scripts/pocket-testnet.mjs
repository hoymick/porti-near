// Public demo pocket on NEAR testnet: free test NEAR, the real contract, so
// anyone can try Phone pocket on the hosted site without real money.
//   (cd contracts/pocket && cargo near build non-reproducible-wasm)
//   npm run pocket:testnet            # once; reuses .wrangler/pocket-testnet.json after
//   npm run pocket:testnet -- --dev   # also point local .dev.vars at it
// Creates porti-demo-<id>.testnet (owner) and porti-bob-<id>.testnet (recipient)
// from the testnet faucet, then runs the one-transaction pocket setup.
import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { Account, JsonRpcProvider, KeyPair, actions } from "near-api-js";
import { setDevVars } from "./dev-vars.mjs";
import { DEMO_PIN } from "../lib/ussd-core.mjs";

const root = resolve(import.meta.dirname, "..");
const RPC = "https://rpc.testnet.near.org";
const FAUCET = "https://helper.nearprotocol.com/account";
const statePath = join(root, ".wrangler/pocket-testnet.json");
const near = (n) => BigInt(Math.round(n * 1e6)) * 10n ** 18n;
const TGAS = 10n ** 12n;
const CAPS = { per_tx_cap: near(0.5).toString(), daily_cap: near(2).toString() };

let state;
if (existsSync(statePath)) {
  state = JSON.parse(readFileSync(statePath, "utf8"));
  console.log(`Reusing ${statePath}`);
} else {
  const wasmPath = join(root, "contracts/pocket/target/near/porti_pocket.wasm");
  if (!existsSync(wasmPath)) {
    console.error("Build the contract first: (cd contracts/pocket && cargo near build non-reproducible-wasm)");
    process.exit(1);
  }
  const id = Date.now().toString(36);
  const keys = { owner: KeyPair.fromRandom("ed25519"), bob: KeyPair.fromRandom("ed25519"), server: KeyPair.fromRandom("ed25519") };
  const ids = { owner: `porti-demo-${id}.testnet`, bob: `porti-bob-${id}.testnet` };
  ids.pocket = `pocket.${ids.owner}`;
  for (const who of ["owner", "bob"]) {
    const r = await fetch(FAUCET, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ newAccountId: ids[who], newAccountPublicKey: keys[who].getPublicKey().toString() }),
    });
    if (!r.ok) throw new Error(`Faucet refused ${ids[who]}: ${r.status}`);
    console.log(`created ${ids[who]} (10 test NEAR)`);
  }
  const provider = new JsonRpcProvider({ url: RPC });
  const owner = new Account(ids.owner, provider, keys.owner.toString());
  await owner.signAndSendTransaction({
    receiverId: ids.pocket,
    actions: [
      actions.createAccount(),
      actions.transfer(near(6)), // ~1.35 storage + ~4.6 spendable + reserve
      actions.deployContract(new Uint8Array(readFileSync(wasmPath))),
      actions.functionCall("new", { owner_id: ids.owner, ...CAPS }, 30n * TGAS, 0n),
      actions.addFunctionCallAccessKey(keys.server.getPublicKey(), ids.pocket, ["send", "freeze"], near(1)),
    ],
  });
  state = { network: "testnet", rpc: RPC, ...ids, serverKey: keys.server.toString(), ownerKey: keys.owner.toString(), bobKey: keys.bob.toString() };
  mkdirSync(join(root, ".wrangler"), { recursive: true });
  writeFileSync(statePath, JSON.stringify(state, null, 2), { mode: 0o600 });
}

const provider = new JsonRpcProvider({ url: RPC });
const pocket = await provider.callFunction({ contractId: state.pocket, method: "get_pocket", args: {} });
if (process.argv.includes("--dev"))
  setDevVars({
    PORTI_SIM_RPC: RPC,
    PORTI_SIM_POCKET: state.pocket,
    PORTI_SIM_POCKET_KEY: state.serverKey,
    PORTI_SIM_OWNER_KEY: state.ownerKey,
    PORTI_SIM_RECIPIENTS: `bob=${state.bob}`,
    PORTI_SIM_PIN: DEMO_PIN,
  });

console.log(`
Testnet demo pocket ready
  owner      ${state.owner}  (keeps unfreeze / withdraw / set_limits)
  pocket     ${state.pocket}  https://testnet.nearblocks.io/address/${state.pocket}
  recipient  @bob -> ${state.bob}
  get_pocket ${JSON.stringify(pocket)}
  state      ${statePath} (keys; gitignored)${process.argv.includes("--dev") ? "\n  .dev.vars  PORTI_SIM_* now point at testnet" : ""}

Production (Cloudflare Worker settings):
  vars    PORTI_SIM_POCKET=${state.pocket}
          PORTI_SIM_RECIPIENTS=bob=${state.bob}
  secrets PORTI_SIM_POCKET_KEY (serverKey) and PORTI_SIM_OWNER_KEY (ownerKey, testnet demo owner;
          lets the demo unfreeze itself a minute after a visitor freezes it):
          node -e 'process.stdout.write(require("./.wrangler/pocket-testnet.json").serverKey)' | npx wrangler secret put PORTI_SIM_POCKET_KEY --config dist/server/wrangler.json
          node -e 'process.stdout.write(require("./.wrangler/pocket-testnet.json").ownerKey)' | npx wrangler secret put PORTI_SIM_OWNER_KEY --config dist/server/wrangler.json`);
