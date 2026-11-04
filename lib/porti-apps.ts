import { DomainError } from "./errors.mjs";
import { nearAccountOK, decimal } from "./near-core.mjs";
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
  } else if (appId === "near-staking") {
    if (Object.keys(args).some(k => k !== "poolAccount") || !nearAccountOK(args.poolAccount) || !/\.(poolv1|pool)\.near$/.test(args.poolAccount)) throw new DomainError("APP_INPUT", "Enter a standard mainnet staking pool account ending in .poolv1.near or .pool.near.");
    contract = args.poolAccount;
    const total = await view("get_total_staked_balance");
    const accounts = await view("get_number_of_accounts");
    const fee = await view("get_reward_fee_fraction");
    if (!uint(total) || !Number.isSafeInteger(accounts) || accounts < 0 || !Number.isSafeInteger(fee?.numerator) || !Number.isSafeInteger(fee?.denominator) || fee.denominator <= 0 || fee.numerator < 0 || fee.numerator > fee.denominator) invalid();
    data = {totalStakedYocto:total,delegators:accounts,rewardFee:fee};
  } else if (appId === "meta-pool") {
    if (Object.keys(args).length) throw new DomainError("APP_INPUT", "Meta Pool state takes no inputs.");
    contract = "meta-pool.near";
    const price = await view("get_st_near_price");
    const supply = await view("ft_total_supply");
    const metadata = await view("ft_metadata");
    if (!uint(price) || !uint(supply) || !Number.isInteger(metadata?.decimals) || metadata.decimals < 0 || metadata.decimals > 36) invalid();
    data = {stNearPriceYocto:price,totalSupplyRaw:supply,decimals:metadata.decimals,stNearPriceFormatted:decimal(price,24)+" NEAR per stNEAR",totalSupplyFormatted:decimal(supply,metadata.decimals)+" stNEAR"};
  } else if (appId === "near-social") {
    if (Object.keys(args).some(k => k !== "account") || !nearAccountOK(args.account)) throw new DomainError("APP_INPUT", "Enter an exact NEAR mainnet account for the public profile.");
    contract = "social.near";
    const raw = await view("get", {keys:[args.account+"/profile/name",args.account+"/profile/description"]});
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) invalid();
    const profile = raw[args.account]?.profile;
    const leaf = (v: any, max: number) => { if(v == null) return ""; const text = typeof v === "string" ? v : v?.[""]; if(typeof text !== "string") invalid(); return text.slice(0,max); };
    data = {account:args.account,name:leaf(profile?.name,256),bio:leaf(profile?.description,2000),found:!!profile};
  } else if (appId === "astro-dao") {
    if (Object.keys(args).some(k => k !== "daoAccount") || !nearAccountOK(args.daoAccount) || !args.daoAccount.endsWith(".sputnik-dao.near")) throw new DomainError("APP_INPUT", "Enter a Sputnik v2 DAO account ending in .sputnik-dao.near.");
    contract = args.daoAccount;
    const config = await view("get_config");
    const nextId = await view("get_last_proposal_id");
    if (typeof config?.name !== "string" || typeof config?.purpose !== "string" || !Number.isSafeInteger(nextId) || nextId < 0) invalid();
    const proposals = nextId ? await view("get_proposals",{from_index:Math.max(0,nextId-5),limit:5}) : [];
    if (!Array.isArray(proposals) || proposals.length > 5 || !proposals.every((p:any) => Number.isSafeInteger(p.id) && p.id >= Math.max(0,nextId-5) && p.id < nextId && typeof p.description === "string" && typeof p.status === "string")) invalid();
    data = {daoAccount:contract,name:config.name.slice(0,256),purpose:config.purpose.slice(0,2000),nextProposalId:nextId,proposals:proposals.map((p:any)=>({id:p.id,description:p.description.slice(0,1000),status:p.status.slice(0,60)}))};
  } else throw new DomainError("APP_ACTION", "No reviewed adapter is available for this app.");

  return {appId,actionId,network:"mainnet",checkedAt:Date.now(),data,evidence,notice:"Read-only contract data. Contract values and public profiles do not establish safety, identity, yield or an executable quote. Independent Porti adapter; no partnership implied."};
}
