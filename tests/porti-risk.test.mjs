import test from 'node:test';import assert from 'node:assert/strict';
import {holderGraph,tokenRisk,riskReportHtml} from '../lib/token-risk.mjs';
import {nearDemo} from '../lib/near-demo.mjs';
test('NEAR holder graph rejects foreign address formats and duplicate accounts',()=>{const s=nearDemo().snapshot;s.holders=[{address:{hash:'alice.near',is_contract:false},value:'10'},{address:{hash:'alice.near',is_contract:false},value:'10'},{address:{hash:'0x'+'a'.repeat(40)},value:'999'}];assert.deepEqual(holderGraph(s).nodes.map(n=>n.id),['alice.near']);});
test('risk export uses Porti branding and NEAR links while escaping metadata',()=>{const s=nearDemo().snapshot;s.metadata.symbol='<script>alert(1)</script>';const html=riskReportHtml(s,false);assert(html.includes('Porti Rug Guard'));assert(html.includes('https://nearblocks.io/address/'));assert(!html.includes('<script>alert(1)</script>'));assert(html.includes('&lt;script&gt;'));assert.equal(tokenRisk(s).probability,null);});
