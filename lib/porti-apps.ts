import { DomainError } from "./errors.mjs";
import { nearAccountOK } from "./near-core.mjs";
import { nearRpc } from "./near-services";
import { registeredApp } from "./porti-app-registry";

const uint = (v: unknown) => typeof v === "string" && /^\d{1,80}$/.test(v);
function invalid() { throw new DomainError("APP_RESPONSE", "The contract returned an unsupported response. No result was inferred.", 502); }
export async function runPortiApp(id: string, appId: string, actionId: string, args: any) {
  const app = registeredApp(appId);
  if (!app || !app.actions.some(a => a.id === actionId)) throw new DomainError("APP_ACTION", "This app action is not registered.");
  if (!args || typeof args !== "object" || Array.isArray(args)) throw new DomainError("APP_INPUT", "Provide valid app inputs.");
  let contract: string;
  let blockId: string | undefined;
  const evidence: any[] = [];
  async function view(method: string, params = {}) {
    const result = await nearRpc(id, "query", {request_type:"call_function", ...(blockId ? {block_id:blockId} : {finality:"final"}), account_id:contract, method_name:method, args_base64:btoa(JSON.stringify(params))});
    if (!Array.isArray(result.result) || result.result.length > 64000 || typeof result.block_hash !== "string" || !Number.isSafeInteger(result.block_height)) invalid();
    if (blockId && result.block_hash !== blockId) invalid();
    blockId = result.block_hash;
    evidence.push({contract,method,blockHash:blockId,blockHeight:result.block_height});
    try { return JSON.parse(new TextDecoder().decode(new Uint8Array(result.result))); } catch { return invalid(); }
  }
  let data: any;
  if (appId === "rhea-pools") {
    if (Object.keys(args).some(k => k !== "poolId") || !Number.isSafeInteger(args.poolId) || args.poolId < 0 || args.poolId > 10000000) throw new DomainError("APP_INPUT", "Enter a whole pool ID between 0 and 10,000,000.");
    contract = "v2.ref-finance.near";
    const total = await view("get_number_of_pools");
    if (!Number.isSafeInteger(total) || total < 0) invalid();
    if (args.poolId >= total) throw new DomainError("POOL_MISSING", "This pool ID is outside the exchange’s current pool range.");
    const pools = await view("get_pools", {from_index:args.poolId,limit:1});
    const p = pools?.[0];
    if (!Array.isArray(pools) || pools.length !== 1 || !p || !Array.isArray(p.token_account_ids) || p.token_account_ids.length < 2 || p.token_account_ids.length > 10 || !p.token_account_ids.every(nearAccountOK) || !Array.isArray(p.amounts) || p.amounts.length !== p.token_account_ids.length || !p.amounts.every(uint) || !Number.isSafeInteger(p.total_fee) || p.total_fee < 0 || p.total_fee > 10000) invalid();
    data = {poolId:args.poolId,totalPools:total,tokens:p.token_account_ids,reservesRaw:p.amounts,feeBps:p.total_fee,poolKind:typeof p.pool_kind === "string" ? p.pool_kind.slice(0,60) : "Unspecified"};
  } else {
    if (Object.keys(args).some(k => k !== "poolAccount") || !nearAccountOK(args.poolAccount) || !/\.(poolv1|pool)\.near$/.test(args.poolAccount)) throw new DomainError("APP_INPUT", "Enter a standard mainnet staking pool account ending in .poolv1.near or .pool.near.");
    contract = args.poolAccount;
    const total = await view("get_total_staked_balance");
    const accounts = await view("get_number_of_accounts");
    const fee = await view("get_reward_fee_fraction");
    if (!uint(total) || !Number.isSafeInteger(accounts) || accounts < 0 || !Number.isSafeInteger(fee?.numerator) || !Number.isSafeInteger(fee?.denominator) || fee.denominator <= 0 || fee.numerator < 0 || fee.numerator > fee.denominator) invalid();
    data = {totalStakedYocto:total,delegators:accounts,rewardFee:fee};
  }
  return {appId,actionId,network:"mainnet",checkedAt:Date.now(),data,evidence,notice:"Read-only contract data. Pool balances and fees do not establish safety, yield or an executable quote. Independent Porti adapter; no partnership implied."};
}
