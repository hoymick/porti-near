import {nearAccountOK} from './near-core.mjs';
import {responseJSON} from './request-guard.mjs';
import {DomainError} from './errors.mjs';

// Research only: no executable quotes or transfer sizing use this price list.
export function createRheaPriceLookup(fetcher = fetch, now = Date.now) {
  let cached=null, pending=null, cooldown=0;
  return async function lookup(contract) {
    if (!nearAccountOK(contract)) throw new DomainError('INVALID_TOKEN','Use an exact NEAR token contract.');
    if (!cached || now()-cached.at>=45000) {
      if (cooldown>now()) throw new DomainError('PRICE_UNAVAILABLE','Rhea price feed is cooling down after a rate limit.',503);
      if (!pending) pending=(async()=>{
        const response=await fetcher('https://api.ref.finance/list-token-price',{headers:{Accept:'application/json'},redirect:'manual',signal:AbortSignal.timeout(12000)});
        if (response.status===429) {cooldown=now()+60000;throw new DomainError('PRICE_UNAVAILABLE','Rhea price feed is rate-limiting requests.',503);}
        if (!response.ok) throw new DomainError('PRICE_UNAVAILABLE',`Rhea price feed returned HTTP ${response.status}.`,503);
        const data=await responseJSON(response,2000000);
        cached={data,at:now()};
      })().finally(()=>{pending=null;});
      await pending;
    }
    const item=Object.hasOwn(cached.data,contract)?cached.data[contract]:null;
    const price=item?.price;
    if (!['string','number'].includes(typeof price) || (typeof price==='string'&&!/^\d+(?:\.\d+)?$/.test(price)) || !Number.isFinite(Number(price)) || Number(price)<=0)
      throw new DomainError('PRICE_UNAVAILABLE','Rhea did not return a usable research price for this contract.',503);
    return {usd:Number(price),contract,source:'Rhea Finance price indexer',fetchedAt:cached.at,timestamp:Math.floor(cached.at/1000),url:'https://api.ref.finance/list-token-price',note:'Research-only indexer estimate. Timestamp is when Porti fetched the list; the provider supplies no per-token quote timestamp. Not an executable quote or evidence of pool depth, sellability or safety.'};
  };
}
