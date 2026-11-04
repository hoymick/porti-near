export const LIGHTER_UI='https://robinhoodchain.lighter.xyz';
export const LIGHTER_API='https://api.rh.lighter.xyz';
export const SAMPLE_MARKETS=[{id:0,symbol:'BTC',price:70000,priceType:'fictional reference',status:'sample'},{id:1,symbol:'ETH',price:2500,priceType:'fictional reference',status:'sample'},{id:2,symbol:'SOL',price:150,priceType:'fictional reference',status:'sample'}];
export function tradePlan({market,side,margin,leverage,stop,target},now=Date.now()){
 const price=Number(market?.price),m=Number(margin),l=Number(leverage),sl=Number(stop),tp=Number(target);
 if(!market||!Number.isFinite(price)||price<=0)throw new Error('A fresh venue reference price is required.');
 if(!['long','short'].includes(side))throw new Error('Choose Long or Short.');
 if(!Number.isFinite(m)||m<1||m>100000)throw new Error('Margin must be between 1 and 100,000 quote units.');
 if(!Number.isInteger(l)||l<1||l>5)throw new Error('Planning leverage must be between 1× and 5×. Venue limits can be lower.');
 if(!Number.isFinite(sl)||!Number.isFinite(tp)||sl<=0||tp<=0)throw new Error('Set positive stop and target reference prices.');
 if(side==='long'&&!(sl<price&&tp>price)||side==='short'&&!(sl>price&&tp<price))throw new Error(side==='long'?'For a long, stop must be below reference and target above.':'For a short, stop must be above reference and target below.');
 const notional=m*l,quantity=notional/price,direction=side==='long'?1:-1,stopPnl=direction*(sl-price)*quantity,targetPnl=direction*(tp-price)*quantity;
 if(-stopPnl>=m)throw new Error('The planned stop loss reaches or exceeds posted margin before costs. Choose a closer stop or reduce leverage.');
 return{marketId:market.id,symbol:market.symbol,side,margin:m,leverage:l,referencePrice:price,priceType:market.priceType,notional,quantity,stop:sl,target:tp,stopPnl,targetPnl,rewardRisk:targetPnl/-stopPnl,createdAt:now,expiresAt:now+60000,venue:'Lighter · Robinhood Chain',execution:'not-submitted',limitations:['Planning estimates only; no fill or collateral check.','Fees, funding, slippage and maintenance margin are excluded.','Stop/target levels are instructions to review, not active venue orders.','Leverage and market eligibility must be confirmed at the venue.']};
}
