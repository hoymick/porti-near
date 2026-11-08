'use client';
import React, {useState} from 'react';

export default function WalletHub({roles,account,onConnect,onUnlink,onFund,onTransfer,onCreateInternal,walletError,sample,busy}:{roles:any;account:string;onConnect:(role:string)=>void;onUnlink:(role:string)=>void;onFund:()=>void;onTransfer:()=>void;onCreateInternal:()=>void;walletError:string;sample:boolean;busy:boolean}) {
  const [copiedAddress,setCopiedAddress] = useState('');
  const [copyError,setCopyError] = useState('');

  async function copyAddress(address:string) {
    setCopyError('');
    setCopiedAddress('');
    try {
      await navigator.clipboard.writeText(address);
      setCopiedAddress(address);
    } catch {
      setCopyError('Copy was unavailable. Select and copy the address shown below.');
    }
  }

  return <>
    <section className="sc-panel porti-wallet-intro">
      <span className="sc-eyebrow">YOUR WALLETS</span>
      <h2>Your funds, ready for your next move.</h2>
      <p>Create a device wallet in Porti, or connect a wallet you already use. Choose an account below to receive NEAR or prepare a transfer.</p>
      <div className="wallet-overview" aria-label="Selected wallet">
        <span className="wallet-network">NEAR mainnet</span>
        <span>{account ? 'Selected for signing' : 'Connect or unlock to get started'}</span>
        <code>{account || 'No wallet selected'}</code>
      </div>
      <div className="sc-buttons">
        <button className="primary" disabled={busy||sample} onClick={onCreateInternal}>Create or unlock device wallet</button>
        <button className="secondary" disabled={busy||sample} onClick={()=>onConnect('main')}>Connect existing wallet</button>
      </div>
      <p className="sc-fine">Save your encrypted backup and password. Creating a device address is free; account activation and transactions have NEAR network costs.</p>
      {walletError&&<p className="apps-notice" role="alert">{walletError}</p>}
      <details><summary>Need an external wallet?</summary>
        <p>Create or recover an account with your provider, then connect it here.</p>
        <a href="https://wallet.meteorwallet.app/" target="_blank" rel="noopener noreferrer">Open Meteor wallet ↗</a>
      </details>
    </section>
    <div className="sc-two-col wallet-account-grid">
      {['main','agent'].map(role=>{
        const linked = roles?.[role];
        const selected = !!linked && account === linked.account;
        return <section className="sc-panel porti-wallet-card" key={role}>
          <div className="wallet-card-heading">
            <span className="sc-eyebrow">{role==='main'?'01 · MAIN WALLET':'02 · AGENT WALLET'}</span>
            <span className="wallet-state">{selected?'Selected':linked?'Linked':'Set up'}</span>
          </div>
          <h2>{role==='main'?'Your everyday wallet.':'Your Porti working wallet.'}</h2>
          <p>{role==='main'?'Use an existing NEAR account as your main source of funds.':'Keep a separate balance for the actions you review with Porti. This account must differ from your main wallet.'}</p>
          <div className="near-profile-wallet">
            <strong>{linked?.account||'No verified wallet linked'}</strong>
            <p>{linked?.verifiedAt ? 'Ownership verified '+new Date(linked.verifiedAt).toLocaleDateString() : 'Connect and verify ownership to link this account.'}</p>
          </div>
          <div className="sc-buttons">
            {role==='agent'&&<button className="primary" disabled={busy||sample} onClick={onCreateInternal}>Create / unlock inside Porti</button>}
            <button className={role==='main'?'primary':'secondary'} disabled={busy||sample} onClick={()=>onConnect(role)}>Connect {role} wallet</button>
          </div>
          {linked&&<>
            <p className="sc-fine">{selected?'Ready for your wallet approvals.':'Reconnect or unlock this account when you want to sign.'}</p>
            <section className="wallet-deposit" aria-label={'Receive NEAR in '+role+' wallet'}>
              <div className="wallet-card-heading"><h3>Receive NEAR</h3><span className="wallet-network">NEAR mainnet</span></div>
              <p>Send native NEAR from your wallet or exchange to this address.</p>
              <label className="wallet-address-label">{role==='main'?'Main wallet deposit address':'Agent wallet deposit address'}
                <code className="porti-account-code">{linked.account}</code>
              </label>
              <button className="secondary" disabled={sample} onClick={()=>copyAddress(linked.account)}>{copiedAddress===linked.account?'Address copied':'Copy '+role+' deposit address'}</button>
              {copiedAddress===linked.account&&<p className="sc-fine" role="status">Deposit address copied.</p>}
              <div className="wallet-deposit-note"><strong>Before you send</strong><p>Select NEAR mainnet at the sending wallet or exchange. Check this address against the withdrawal details. The sender shows its withdrawal fee.</p></div>
              {role==='agent'&&<>
                <button className="primary" disabled={sample||busy||!roles.main} onClick={onFund}>Fund from main wallet</button>
                <p className="sc-fine">{roles.main?'Select your verified main wallet to prepare the funding transfer.':'Link your main wallet to fund this account from inside Porti.'}</p>
              </>}
              <p className="sc-fine">For other tokens, confirm token support and storage registration first.</p>
            </section>
            <button className="secondary wallet-unlink" disabled={busy||sample} onClick={()=>onUnlink(role)}>Unlink {role} wallet</button>
          </>}
        </section>;
      })}
    </div>
    {copyError&&<p className="apps-notice" role="alert">{copyError}</p>}
    <section className="sc-panel porti-wallet-card">
      <span className="sc-eyebrow">SEND FUNDS</span><h2>Prepare a transfer.</h2>
      <p>Choose the recipient and amount, review the details, then approve in your selected wallet.</p>
      <p>Selected wallet: <strong>{account||'Connect or unlock a wallet first'}</strong></p>
      <button className="primary" disabled={sample||busy||!account} onClick={onTransfer}>Open Transfers</button>
    </section>
  </>;
}
