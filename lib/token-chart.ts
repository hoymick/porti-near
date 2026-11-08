import { responseJSON } from "./request-guard.mjs";
import { nearAccountOK } from "./near-core.mjs";
import { candles, reading } from "./chart-core.mjs";
import { DomainError } from "./errors.mjs";
const cache = new Map<string, { at: number; data: any }>();
let providerCooldown = 0;
export async function get(path: string) {
  try {
    if (providerCooldown > Date.now())
      throw new DomainError(
        "MARKET_COOLDOWN",
        "GeckoTerminal is cooling down after a rate limit. Try again later.",
        503,
      );
    const r = await fetch("https://api.geckoterminal.com/api/v2" + path, {
      headers: { Accept: "application/json" },
      redirect: "manual",
      signal: AbortSignal.timeout(12000),
    });
    if (r.status === 429) {
      const retryAfter = r.headers.get("Retry-After");
      let delay = 0;
      if (retryAfter) {
        delay = /^\d+$/.test(retryAfter)
          ? Number(retryAfter) * 1000
          : Date.parse(retryAfter) - Date.now();
      }
      providerCooldown = Date.now() + Math.min(900000, Math.max(60000, delay || 0));
      throw new DomainError(
        "MARKET_COOLDOWN",
        "GeckoTerminal is rate-limiting requests. Try again later.",
        503,
      );
    }
    if (!r.ok)
      throw new DomainError(
        "CHART_UNAVAILABLE",
        `Market data returned HTTP ${r.status}.`,
        503,
      );
    return await responseJSON(r, 500000);
  } catch (e) {
    if (e instanceof DomainError) throw e;
    throw new DomainError(
      "CHART_UNAVAILABLE",
      "GeckoTerminal market data is unavailable.",
      503,
    );
  }
}
const marketCache = new Map<string, { at: number; data: any }>();
const marketPending = new Map<string, Promise<any>>();
export function selectTokenPool(data: any, contract: string) {
  if (!Array.isArray(data?.data))
    throw new DomainError("MARKET_RESPONSE", "Market pool data was not recognized.", 503);
  return data.data.filter((p: any) =>
    p.id?.startsWith("near_") &&
    ["base_token", "quote_token"].some(k => p.relationships?.[k]?.data?.id === "near_" + contract) &&
    Number.isFinite(Number(p.attributes?.reserve_in_usd)) && Number(p.attributes?.reserve_in_usd) > 0
  ).sort((a: any, b: any) => Number(b.attributes.reserve_in_usd) - Number(a.attributes.reserve_in_usd))[0];
}
export async function tokenMarket(contract: string) {
  if (!nearAccountOK(contract)) throw new DomainError("CHART_INPUT", "Use an exact NEAR token contract.");
  const prior = marketCache.get(contract);
  if (prior && Date.now() - prior.at < 45000) return prior.data;
  if (marketPending.has(contract)) return marketPending.get(contract)!;
  if (marketPending.size >= 8) throw new DomainError("MARKET_BUSY", "Market requests are busy. Try again shortly.", 503);
  const work = (async () => {
    const pools = await get(`/networks/near/tokens/${encodeURIComponent(contract)}/pools?page=1`);
    const pool = selectTokenPool(pools, contract);
    if (!pool) throw new DomainError("NO_MARKET", "No covered NEAR pool was returned for this contract.", 404);
    const side = pool.relationships?.base_token?.data?.id === "near_" + contract ? "base" : "quote";
    const a = pool.attributes, positive = (v: any) => Number.isFinite(Number(v)) && Number(v) > 0 ? Number(v) : null;
    const nonnegative = (v: any) => v !== null && v !== undefined && v !== "" && Number.isFinite(Number(v)) && Number(v) >= 0 ? Number(v) : null;
    const fetchedAt = Date.now();
    const data = {
      contract, tokenSide: side, pool: pool.id.slice(5), name: String(a.name || "NEAR market").slice(0, 120),
      usd: positive(a[side === "base" ? "base_token_price_usd" : "quote_token_price_usd"]),
      liquidityUsd: positive(a.reserve_in_usd), volume24hUsd: nonnegative(a.volume_usd?.h24),
      buys24h: nonnegative(a.transactions?.h24?.buys), sells24h: nonnegative(a.transactions?.h24?.sells),
      fetchedAt, timestamp: Math.floor(fetchedAt / 1000), source: "GeckoTerminal",
      url: "https://www.geckoterminal.com/near/pools/" + encodeURIComponent(pool.id.slice(5)),
      coverage: "Largest reported-liquidity matching pool on the first provider page. Price, reserve valuation and 24h activity are provider snapshots, not executable quotes, a full-market total, or proof of sellability. Timestamp is Porti's fetch time; the provider does not supply a quote timestamp.",
    };
    if (marketCache.size >= 32) marketCache.delete(marketCache.keys().next().value!);
    marketCache.set(contract, {at: fetchedAt, data});
    return data;
  })().finally(() => marketPending.delete(contract));
  marketPending.set(contract, work);
  return work;
}

async function fetchChart(contract: string, frame = "1h") {
  if (!nearAccountOK(contract) || !["15m", "1h", "4h"].includes(frame))
    throw new DomainError(
      "CHART_INPUT",
      "Use an exact NEAR token contract and supported timeframe.",
    );
  const key = contract + ":" + frame,
    prior = cache.get(key);
  if (prior && Date.now() - prior.at < 45000) return prior.data;
  const market = await tokenMarket(contract);
  const poolFetchedAt = market.fetchedAt;
  const seconds = frame === "15m" ? 900 : frame === "1h" ? 3600 : 14400,
    unit = frame === "15m" ? "minute" : "hour",
    aggregate = frame === "15m" ? 15 : frame === "4h" ? 4 : 1,
    side = market.tokenSide;
  const raw = await get(
      `/networks/near/pools/${encodeURIComponent(market.pool)}/ohlcv/${unit}?aggregate=${aggregate}&limit=200&currency=usd&token=${side}&include_empty_intervals=false`,
    ),
    rows = candles(raw.data?.attributes?.ohlcv_list, 0),
    completed = candles(raw.data?.attributes?.ohlcv_list, seconds);
  if (rows.length < 2)
    throw new DomainError(
      "NO_CANDLES",
      "Too few completed candles to read this market.",
      404,
    );
  const data = {
    contract,
    quoteCurrency: "USD",
    tokenSide: side,
    poolFetchedAt,
    latestCandleAt: rows.at(-1)[0] * 1000,
    latestCompletedCandleAt: completed.length ? completed.at(-1)[0] * 1000 : null,
    changeCoverage: "Percentage change is first-to-last completed candle close in the returned sample, not necessarily one timeframe or 24 hours. Range timestamps identify candle opening times.",
    priceUnit: "USD per token",
    frame,
    seconds,
    pool: market.pool,
    name: market.name,
    rows,
    reading: completed.length ? reading(completed) : null,
    forming: rows.at(-1)[0] + seconds > Date.now() / 1000,
    livePrice: market.usd,
    liquidityUsd: market.liquidityUsd,
    volume24hUsd: market.volume24hUsd,
    fetchedAt: Date.now(),
    stale: Date.now() / 1000 - rows.at(-1)[0] > seconds * 3,
    gaps: rows.some(
      (r: any, i: number) => i && r[0] - rows[i - 1][0] > seconds * 1.5,
    ),
    source: "GeckoTerminal",
    url:
      "https://www.geckoterminal.com/near/pools/" +
      encodeURIComponent(market.pool),
  };
  if (cache.size >= 32) cache.delete(cache.keys().next().value!);
  cache.set(key, { at: Date.now(), data });
  return data;
}

const inflight = new Map<string, Promise<any>>();
export async function tokenChart(contract: string, frame = "1h") {
  if (!nearAccountOK(contract) || !["15m", "1h", "4h"].includes(frame))
    throw new DomainError(
      "CHART_INPUT",
      "Use an exact NEAR contract and supported timeframe.",
    );
  const key = contract + ":" + frame,
    prior = cache.get(key);
  if (prior && Date.now() - prior.at < 45000) return prior.data;
  if (inflight.has(key)) return inflight.get(key)!;
  if (inflight.size >= 8)
    throw new DomainError(
      "MARKET_BUSY",
      "Market requests are busy. Try again shortly.",
      503,
    );
  const work = fetchChart(contract, frame)
    .catch((e) => {
      if (prior && Date.now() - prior.at < 900000)
        return {
          ...prior.data,
          stale: true,
          refreshError:
            "Market refresh is unavailable. Showing the last successful snapshot.",
        };
      throw e;
    })
    .finally(() => inflight.delete(key));
  inflight.set(key, work);
  return work;
}

