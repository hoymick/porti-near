// Proves the pocket limits on the local sandbox chain using the server (USSD) key:
// in-cap send succeeds, over-cap send and owner-only methods are refused.
//   npm run pocket:check   (after npm run pocket:sandbox)
import { readFileSync } from "node:fs";
import { Account, JsonRpcProvider, actions } from "near-api-js";
const s = JSON.parse(readFileSync(process.argv[2] || ".wrangler/pocket-sandbox.json", "utf8"));
const provider = new JsonRpcProvider({ url: s.rpc });
const server = new Account(s.pocket, provider, s.serverKey); // the USSD backend's key
const near = (n) => (BigInt(Math.round(n * 1e6)) * 10n ** 18n).toString();
const bal = async () => Number((await provider.viewAccount({ accountId: s.bob })).amount) / 1e24;
const call = async (label, method, args, deposit = 0n) => {
  try {
    await server.signAndSendTransaction({ receiverId: s.pocket, actions: [actions.functionCall(method, args, 30n * 10n ** 12n, deposit)] });
    console.log("ALLOWED ", label);
  } catch (e) {
    console.log("REFUSED ", label, "->", String(e?.message || e).match(/(Amount exceeds[^"\\]*|Only the owner[^"\\]*|MethodNameMismatch|DepositWithFunctionCall[^"\\]*|not allowed[^"\\]*)/i)?.[0] || String(e?.message).slice(0, 120));
  }
};
const before = await bal();
await call("send 0.05 NEAR to bob", "send", { receiver_id: s.bob, amount: near(0.05) });
await call("send 0.2 NEAR (over per-tx cap 0.1)", "send", { receiver_id: s.bob, amount: near(0.2) });
await call("withdraw (owner-only)", "withdraw", {});
await call("set_limits to 100 NEAR (owner-only)", "set_limits", { per_tx_cap: near(100), daily_cap: near(100) });
await call("withdraw with 1 yocto attached", "withdraw", {}, 1n);
console.log(`bob received: ${(await bal() - before).toFixed(4)} NEAR`);
