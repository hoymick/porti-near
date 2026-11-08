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
async function fetchChart(contract: string, frame = "1h") {
  if (!nearAccountOK(contract) || !["15m", "1h", "4h"].includes(frame))
    throw new DomainError(
      "CHART_INPUT",
      "Use an exact NEAR token contract and supported timeframe.",
    );
  const key = contract + ":" + frame,
    prior = cache.get(key);
  if (prior && Date.now() - prior.at < 45000) return prior.data;
  const pools = await get(
    `/networks/near/tokens/${encodeURIComponent(contract)}/pools?page=1`,
  );
  const matches = (p: any) =>
    ["base_token", "quote_token"].find(
      (k) => p.relationships?.[k]?.data?.id === "near_" + contract,
    );
  if (!Array.isArray(pools.data))
    throw new DomainError(
      "MARKET_RESPONSE",
      "Market pool data was not recognized.",
      503,
    );
  const poolFetchedAt = Date.now();
  const pool = pools.data
    .filter(
      (p: any) =>
        p.id?.startsWith("near_") &&
        matches(p) &&
        Number(p.attributes?.reserve_in_usd) > 0,
    )
    .sort(
      (a: any, b: any) =>
        Number(b.attributes.reserve_in_usd) -
        Number(a.attributes.reserve_in_usd),
    )[0];
  if (!pool)
    throw new DomainError(
      "NO_MARKET",
      "No covered NEAR pool was returned for this contract.",
      404,
    );
  const seconds = frame === "15m" ? 900 : frame === "1h" ? 3600 : 14400,
    unit = frame === "15m" ? "minute" : "hour",
    aggregate = frame === "15m" ? 15 : frame === "4h" ? 4 : 1,
    side = matches(pool) === "base_token" ? "base" : "quote";
  const raw = await get(
      `/networks/near/pools/${encodeURIComponent(pool.id.slice(5))}/ohlcv/${unit}?aggregate=${aggregate}&limit=200&currency=usd&token=${side}&include_empty_intervals=false`,
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
    pool: pool.id.slice(5),
    name: String(pool.attributes.name || "NEAR market").slice(0, 120),
    rows,
    reading: completed.length ? reading(completed) : null,
    forming: rows.at(-1)[0] + seconds > Date.now() / 1000,
    livePrice:
      Number(
        pool.attributes[
          side === "base" ? "base_token_price_usd" : "quote_token_price_usd"
        ],
      ) > 0
        ? Number(
            pool.attributes[
              side === "base" ? "base_token_price_usd" : "quote_token_price_usd"
            ],
          )
        : null,
    fetchedAt: Date.now(),
    stale: Date.now() / 1000 - rows.at(-1)[0] > seconds * 3,
    gaps: rows.some(
      (r: any, i: number) => i && r[0] - rows[i - 1][0] > seconds * 1.5,
    ),
    source: "GeckoTerminal",
    url:
      "https://www.geckoterminal.com/near/pools/" +
      encodeURIComponent(pool.id.slice(5)),
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
