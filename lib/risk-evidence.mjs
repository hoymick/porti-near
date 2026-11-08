import {nearAccountOK,nearHashOK,decimal} from './near-core.mjs';

const uint=v=>typeof v==='string'&&/^\d{1,80}$/.test(v);
const dex='dclv2.ref-labs.near';
const fees=[100,400,2000,10000];
const hootCode='2uPhSwUzMbV9MHHitiWUKTdPeRGYXHJungpoH5kDbL2d';
export function wasmExports(bytes) {
  if (!(bytes instanceof Uint8Array)||bytes.length>1400000||bytes.length<8||[0,97,115,109,1,0,0,0].some((x,i)=>bytes[i]!==x)) throw Error('Unsupported WASM');
  let at=8, end=bytes.length;
  const leb=()=>{let n=0,shift=0;for(let i=0;i<5;i++){if(at>=end)throw Error('Truncated WASM');const b=bytes[at++];n+=(b&127)*2**shift;if(!(b&128)){if(n>0xffffffff)throw Error('Invalid length');return n;}shift+=7;}throw Error('Invalid length');};
  const names=[];let found=false;
  while(at<bytes.length){end=bytes.length;const section=bytes[at++],size=leb(),limit=at+size;if(limit>bytes.length)throw Error('Invalid section');
    if(section===7){if(found)throw Error('Duplicate exports');found=true;end=limit;const count=leb();if(count>512)throw Error('Too many exports');
      for(let i=0;i<count;i++){const len=leb();if(len>128||at+len>end)throw Error('Invalid export');const name=new TextDecoder('utf-8',{fatal:true}).decode(bytes.slice(at,at+len));at+=len;if(at>=end)throw Error('Truncated export');const kind=bytes[at++];if(kind>3)throw Error('Invalid export kind');leb();if(kind===0&&/^[A-Za-z_][A-Za-z0-9_]{0,127}$/.test(name))names.push(name);}
      if(at!==limit)throw Error('Invalid exports');
    }at=limit;
  }return names;
}
export async function wasmHash(bytes) {
  const digest=new Uint8Array(await crypto.subtle.digest('SHA-256',bytes));
  let n=0n;for(const b of digest)n=(n<<8n)+BigInt(b);
  const alphabet='123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';let out='';
  while(n){out=alphabet[Number(n%58n)]+out;n/=58n;}for(const b of digest){if(b!==0)break;out='1'+out;}return out;
}
export async function inspectTokenCode(contract,controls,query) {
  const block=controls?.blockHash;
  const unavailable=reason=>({status:'unavailable',reason,coverage:'No code audit or authority inference was performed.'});
  if(!nearHashOK(block)||!nearHashOK(controls?.codeHash)||!['account','global-hash'].includes(controls.codeSource))return unavailable('A resolved code hash at a finalized block is required.');
  try {
    const raw=await query(controls.codeSource==='global-hash'
      ? {request_type:'view_global_contract_code',block_id:block,code_hash:controls.codeHash}
      : {request_type:'view_code',block_id:block,account_id:contract});
    if(raw.block_hash!==block||typeof raw.code_base64!=='string'||raw.code_base64.length>1900000)throw Error();
    const bytes=Uint8Array.from(atob(raw.code_base64),c=>c.charCodeAt(0));
    if(await wasmHash(bytes)!==controls.codeHash)throw Error();
    const exports=wasmExports(bytes), candidates=exports.filter(x=>/mint|burn|pause|owner|role|upgrade|migrate|whitelist|blacklist|tax|fee/i.test(x));
    const reads=await Promise.all(['get_owner','get_owner_id','is_paused','get_paused','contract_source_metadata',...(controls.codeHash===hootCode?['get_config']:[])].filter(x=>exports.includes(x)).map(async method=>{
      try {
        const result=await query({request_type:'call_function',block_id:block,account_id:contract,method_name:method,args_base64:btoa('{}')});
        if(result.block_hash!==block||!Array.isArray(result.result)||result.result.length>16000)throw Error();
        const value=JSON.parse(new TextDecoder().decode(new Uint8Array(result.result)));
        if(['get_owner','get_owner_id'].includes(method)&&nearAccountOK(value))return {method,status:'returned',value};
        if(['is_paused','get_paused'].includes(method)&&typeof value==='boolean')return {method,status:'returned',value};
        if(method==='get_config'&&controls.codeHash===hootCode&&value&&nearAccountOK(value.owner_id)&&nearAccountOK(value.platform_id)&&Number.isSafeInteger(value.transfer_fee_pips)&&value.transfer_fee_pips>=0&&value.transfer_fee_pips<=1000000&&Array.isArray(value.dcl_lpt_ids)&&value.dcl_lpt_ids.length<=12&&value.dcl_lpt_ids.every(x=>typeof x==='string'&&x.length<=180))return {method,status:'returned',value:{owner_id:value.owner_id,pending_owner_id:nearAccountOK(value.pending_owner_id)?value.pending_owner_id:null,platform_id:value.platform_id,transfer_fee_pips:value.transfer_fee_pips,dcl_exchange_id:nearAccountOK(value.dcl_exchange_id)?value.dcl_exchange_id:null,dcl_pool_id:typeof value.dcl_pool_id==='string'?value.dcl_pool_id.slice(0,160):null,dcl_lpt_ids:value.dcl_lpt_ids},note:'Supported HOOT code-hash adapter. Values are contract-declared configuration at this block, not a proof of transfer behavior or lock guarantees.'};
        if(method==='contract_source_metadata'&&value&&typeof value==='object'&&!Array.isArray(value))return {method,status:'returned',value:{version:typeof value.version==='string'?value.version.slice(0,80):null,link:typeof value.link==='string'&&/^https:\/\//.test(value.link)?value.link.slice(0,512):null},note:'Contract-declared source metadata; source/build equivalence has not been verified.'};
        return {method,status:'unrecognized'};
      }catch{return {method,status:'unavailable'};}
    }));
    return {status:'observed',codeHash:controls.codeHash,blockHash:block,blockHeight:controls.blockHeight,exportCount:exports.length,candidateControlMethods:candidates.slice(0,30),candidateListTruncated:candidates.length>30,reads,coverage:'Hash-matched deployed WASM export names and supported view results only. Names do not establish authorization, behavior or absence of hidden privileges. No bytecode/source semantic audit.'};
  }catch{return unavailable('Deployed code could not be fetched, hash-matched or parsed within the supported size limit.');}
}
export async function inspectDclPool(contract,metadata,controls,query) {
  const block=controls?.blockHash;
  const missing=reason=>({status:'unavailable',reason,coverage:'Rhea DCL against wrap.near at four documented fee tiers only; other pools and venues are outside this check.'});
  if(!nearHashOK(block)||!nearAccountOK(contract)||contract==='wrap.near'||!Number.isInteger(metadata?.decimals)||metadata.decimals<0||metadata.decimals>36)return missing('This pair is outside the adapter’s supported inputs.');
  async function call(method,args){const r=await query({request_type:'call_function',block_id:block,account_id:dex,method_name:method,args_base64:btoa(JSON.stringify(args))});if(r.block_hash!==block||!Array.isArray(r.result)||r.result.length>32000)throw Error();return JSON.parse(new TextDecoder().decode(new Uint8Array(r.result)));}
  const pair=[contract,'wrap.near'].sort();
  const candidates=await Promise.all(fees.map(async fee=>{
    const id=pair.join('|')+'|'+fee;
    try{const p=await call('get_pool',{pool_id:id});if(!p||p.pool_id!==id||p.token_x!==pair[0]||p.token_y!==pair[1]||p.fee!==fee||!uint(p.total_x)||!uint(p.total_y))return null;return p;}catch{return null;}
  }));
  const pools=candidates.filter(Boolean).sort((a,b)=>{const reserve=p=>BigInt(p.token_x==='wrap.near'?p.total_x:p.total_y);return reserve(a)===reserve(b)?0:reserve(a)>reserve(b)?-1:1;});
  if(!pools.length)return missing('No valid pool response was obtained. This does not establish that the token has no liquidity.');
  const p=pools[0], tokenBalance=p.token_x===contract?p.total_x:p.total_y, nearBalance=p.token_x==='wrap.near'?p.total_x:p.total_y;
  const quote=async(input,output,amount,outDecimals)=>{try{const r=await call('quote',{pool_ids:[p.pool_id],input_token:input,output_token:output,input_amount:amount,tag:'porti-research'});if(!uint(r?.amount))throw Error();return {status:BigInt(r.amount)>0n?'output_returned':'zero_output',inputToken:input,inputRaw:amount,outputToken:output,outputRaw:r.amount,outputFormatted:decimal(r.amount,outDecimals)};}catch{return {status:'unavailable',inputToken:input,outputToken:output};}};
  const [sell,buy]=await Promise.all([quote(contract,'wrap.near','1'+'0'.repeat(metadata.decimals),24),quote('wrap.near',contract,'10000000000000000000000',metadata.decimals)]);
  return {status:'observed',source:'NEAR final RPC · Rhea DCL',exchange:dex,pool:p.pool_id,blockHash:block,blockHeight:controls.blockHeight,matchedPools:pools.length,
    tokenBalanceRaw:tokenBalance,tokenBalanceFormatted:decimal(tokenBalance,metadata.decimals),wrappedNearBalanceRaw:nearBalance,wrappedNearBalanceFormatted:decimal(nearBalance,24),state:typeof p.state==='string'?p.state.slice(0,40):'unknown',poolFeePercent:p.fee/10000,
    poolTaxField:p.tax===null?null:p.tax&&typeof p.tax==='object'&&JSON.stringify(p.tax).length<=2000?p.tax:'unrecognized_or_absent',
    quotes:{sell,buy,coverage:'Small read-only quotes: sell 1 token; buy with 0.01 wNEAR. No transfers are executed, so quotes do not simulate token transfer taxes, wallet restrictions, slippage or successful settlement.'},
    lpLock:{status:'not_verified',reason:'Concentrated-liquidity positions have individual owners, ranges and withdrawal rules. Reserve balances and contract-held tokens do not prove locked or burned liquidity.'},
    coverage:'Largest wrapped-NEAR reserve among returned Rhea DCL pools at 0.01%, 0.04%, 0.2% and 1% fee tiers. These are pool-accounted token totals, including orders/fees; not executable depth, USD TVL, or whole-market liquidity. Pool fee/tax settings do not establish token transfer taxes.'};
}
export async function inspectDeclaredPositions(contract,controls,code,query) {
  const config=code?.reads?.find(x=>x.method==='get_config'&&x.status==='returned')?.value;
  if(controls?.codeHash!==hootCode||!config||config.dcl_exchange_id!==dex||!config.dcl_lpt_ids?.length)return {status:'unavailable',reason:'No supported declared LP-position configuration was returned.',lockStatus:'not_verified'};
  try {
    const r=await query({request_type:'call_function',block_id:controls.blockHash,account_id:dex,method_name:'list_liquidities',args_base64:btoa(JSON.stringify({account_id:contract}))});
    if(r.block_hash!==controls.blockHash||!Array.isArray(r.result)||r.result.length>32000)throw Error();
    const data=JSON.parse(new TextDecoder().decode(new Uint8Array(r.result)));
    if(!Array.isArray(data)||data.length>100)throw Error();
    const positions=config.dcl_lpt_ids.map(id=>{const p=data.find(x=>x?.lpt_id===id&&x.pool_id===config.dcl_pool_id&&x.owner_id===contract&&Number.isInteger(x.left_point)&&Number.isInteger(x.right_point)&&x.left_point<x.right_point);return {id,listedForTokenAccount:!!p,...(p?{leftPoint:p.left_point,rightPoint:p.right_point}:{} )};});
    return {status:'observed',source:'NEAR final RPC · Rhea DCL list_liquidities',blockHash:controls.blockHash,account:contract,positions,lockStatus:'not_verified',coverage:'Checks only the position IDs declared by the supported token configuration against the exchange listing for that token account. Account-held positions are not proof of locked/burned liquidity; withdrawal and upgrade authorization remain unaudited.'};
  }catch{return {status:'unavailable',reason:'Declared LP-position ownership listing could not be confirmed.',lockStatus:'not_verified'};}
}
export async function readRiskEvidence(contract,metadata,controls,query) {
  const [code,dex]=await Promise.all([inspectTokenCode(contract,controls,query),inspectDclPool(contract,metadata,controls,query)]);
  const positions=await inspectDeclaredPositions(contract,controls,code,query);
  return {code,dex,positions,checkedAt:Date.now()};
}
