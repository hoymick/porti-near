import test from 'node:test';
import assert from 'node:assert/strict';
import {candles, reading} from '../lib/chart-core.mjs';

const rows = Array.from({length:60}, (_,i) => [1700000000+i*3600, 2, 3, 1, 2, 10]);

test('flat completed history has exact USD indicators and a neutral RSI', () => {
  const r = reading(rows);
  assert.equal(r.ema20,2);
  assert.equal(r.ema50,2);
  assert.equal(r.rsi,50);
  assert.equal(r.support,1);
  assert.equal(r.resistance,3);
  assert.equal(r.change,0);
  assert.equal(r.completedCandles,60);
  assert.equal(r.changeTo-r.changeFrom,59*3600);
});

test('sample return states its full range rather than implying a one-candle change', () => {
  const r = reading(rows.map((row,i)=>[row[0],2+i,4+i,1+i,2+i,10]));
  assert.equal(r.change,(61/2-1)*100);
  assert.equal(r.rsi,100);
  assert.equal(r.changeFrom,rows[0][0]);
  assert.equal(r.changeTo,rows.at(-1)[0]);
});

test('indicators exclude forming candles and preserve gaps without fabricating trades', () => {
  const now=rows.at(-1)[0]+1800;
  const completed=candles([...rows].reverse(),3600,now);
  assert.equal(completed.length,59);
  assert.equal(completed.at(-1)[0],rows[58][0]);
  const gapped=candles([rows[0],rows[5],rows[9]],3600,now);
  assert.equal(gapped.length,3);
  assert.equal(reading(gapped).ema20,null);
  assert.equal(reading(gapped).support,null);
});
