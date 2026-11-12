'use client';
import {decimal} from '../lib/near-core.mjs';
export default function ChatTransferReview({draft,active,busy,onApprove,onDetails}:{draft:any,active:boolean,busy:boolean,onApprove:(d:any)=>Promise<any>,onDetails:(d:any)=>void}) {
 const status = draft.status === 'finalized' ? 'Finalized and verified' : draft.status === 'submitted' ? 'Submitted · verification pending' : draft.status === 'wallet_requested' ? 'Wallet requested · check the original outcome' : active ? 'Ready for your wallet approval' : 'Inactive or expired review';
 return <section className="porti-inline-transfer" aria-label={`Transfer review ${draft.amount} ${draft.symbol}`}>
  <h3>{draft.amount} {draft.symbol}</h3><p>NEAR mainnet · {status}</p>
  <dl><dt>From</dt><dd>{draft.sender}</dd><dt>To{draft.recipientUsername?' @'+draft.recipientUsername:''}</dt><dd>{draft.recipient}</dd><dt>Token</dt><dd>{draft.token==='near'?'Native NEAR':draft.token}</dd><dt>Storage deposit</dt><dd>{decimal(draft.storageDeposit||'0',24)} NEAR</dd><dt>Gas reserve estimate</dt><dd>{draft.gasReserve?decimal(draft.gasReserve,24)+' NEAR':'Network gas is additional'}</dd><dt>Review expires</dt><dd>{new Date(draft.expiresAt).toLocaleTimeString()}</dd></dl>
  {active&&<p>Check these details. Choose Approve in wallet or reply “approve” or “yes” to open your wallet. Only your wallet can sign and send.</p>}
  <div className="sc-buttons"><button type="button" className="primary" disabled={busy||!active} onClick={()=>onApprove(draft)}>{busy?'Please wait…':'Approve in wallet'}</button><button type="button" className="secondary" disabled={busy} onClick={()=>onDetails(draft)}>Details / verify outcome</button></div>
 </section>;
}
