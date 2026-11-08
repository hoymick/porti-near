import {parseHolders} from './near-core.mjs';

export function createHolderLookup(now = Date.now) {
  const cache = new Map(), pending = new Map(), cooldowns = new Map();
  return async function lookup(scope, contract, fetcher) {
    const key = JSON.stringify([scope, contract]);
    const clone = result => ({
      fetchedAt: result.fetchedAt,
      holders: result.holders.map(holder => ({...holder, address: {...holder.address}})),
    });
    for (const [scope, until] of cooldowns) {
      if (until <= now()) cooldowns.delete(scope);
    }
    const cached = cache.get(key);
    if (cached && now() - cached.fetchedAt < 45000) return clone(cached);
    if (pending.has(key)) return clone(await pending.get(key));
    if (cooldowns.has(scope)) {
      const error = new Error('NearBlocks is rate-limiting holder lookups. Try again after one minute.');
      error.code = 'PROVIDER_RATE_LIMIT';
      throw error;
    }
    if (pending.size >= 64) throw new Error('Holder lookups are busy. Try again shortly.');
    const work = (async () => {
      try {
        const holders = parseHolders(await fetcher());
        const result = {holders, fetchedAt: now()};
        if (cache.size >= 64) cache.delete(cache.keys().next().value);
        cache.set(key, result);
        return result;
      } catch (error) {
        if (error.code === 'PROVIDER_RATE_LIMIT') {
          if (cooldowns.size >= 64) cooldowns.delete(cooldowns.keys().next().value);
          cooldowns.set(scope, now() + 60000);
        }
        throw error;
      }
    })();
    pending.set(key, work);
    try { return clone(await work); }
    finally { pending.delete(key); }
  };
}
