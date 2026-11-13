"use client";
// Signed-out home. One idea: a signature line splits what Porti's AI can do
// from what only your wallet can do. Every claim here must stay verified.
import { ArrowRight, Check, Clock, Lock, Phone, ShieldCheck, Wallet, X } from "lucide-react";
import "./porti-landing.css";


const aiCan = [
  ["Research a token", "holders, liquidity, live charts and the risk evidence that exists"],
  ["Follow a wallet", "and send you Telegram alerts when it moves"],
  ["Find @username", "resolve it to a verified NEAR account"],
  ["Prepare a review", "for a transfer, a stake or a swap, with every detail spelled out"],
];
const youCan = [
  ["Sign", "every transfer, stake and swap, in your own wallet"],
  ["Withdraw", "from your phone pocket, even while it is frozen"],
  ["Change limits", "on what your phone pocket may spend"],
  ["Unfreeze", "a pocket you or your phone froze"],
];
const attempts: [string, boolean, string][] = [
  ["Send 0.05 NEAR to bob", true, "Within both caps. Bob received exactly 0.0500 NEAR."],
  ["Send 0.2 NEAR", false, "Contract: amount exceeds per-transaction cap"],
  ["Withdraw the pocket", false, "NEAR: access key does not allow method withdraw"],
  ["Raise limits to 100 NEAR", false, "NEAR: access key does not allow method set_limits"],
  ["Withdraw with 1 yoctoNEAR attached", false, "NEAR: deposits are not allowed with a function-call key"],
];
const verified = [
  "162 automated app tests and 25 pocket contract tests pass",
  "Pocket caps and key limits hold on a local NEAR chain",
  "Phone pocket menu and live Balance over USSD, end to end",
  "Wallet ownership proofs (NEP-413) and @username links, in tests",
  "Receipts only count when the onchain transaction matches the review exactly, in tests",
];
const notYet = [
  "Funded transfers, stakes, swaps and purchases on mainnet",
  "Sending from the phone pocket (Balance works today)",
  "The live telco callback, outside the simulator",
  "An independent security audit",
];

type Props = {
  onDemo: (screen?: string) => void;
  onSignIn: () => void;
  signingIn: boolean;
  error: string;
};

export default function PortiLanding({ onDemo, onSignIn, signingIn, error }: Props) {
  return (
    <div className="pl">
      <header className="pl-top">
        {/* Full reload intentionally resets the single-page workspace state. */}
        {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
        <a href="/" className="pl-brand" aria-label="Porti home">
          <span className="pl-brand-mark" aria-hidden>✦</span>PORTI<span className="pl-brand-pill">NEAR</span>
        </a>
        <nav aria-label="Page sections">
          <a href="#pocket">Phone pocket</a>
          <a href="#proof">Proof</a>
          <a href="#ledger">What’s verified</a>
          <button type="button" className="pl-btn pl-btn-small" onClick={onSignIn} disabled={signingIn}>
            {signingIn ? "Waiting for wallet…" : "Sign in"}
          </button>
        </nav>
      </header>

      <main>
        <section className="pl-hero" aria-labelledby="pl-title">
          <div className="pl-hero-copy">
            <h1 id="pl-title">An AI that <em>can’t sign.</em></h1>
            <p className="pl-lede">
              Porti researches NEAR tokens, follows wallets and prepares transfers, stakes and swaps
              for you to review. Only your wallet can move your NEAR.
            </p>
            <div className="pl-ctas">
              <button type="button" className="pl-btn" onClick={() => onDemo()}>
                Try demo <ArrowRight size={18} aria-hidden />
              </button>
              <button type="button" className="pl-btn pl-btn-ghost" onClick={onSignIn} disabled={signingIn}>
                <Wallet size={18} aria-hidden /> {signingIn ? "Waiting for wallet…" : "Sign in with NEAR wallet"}
              </button>
            </div>
            {error ? (
              <p className="pl-error" role="alert">{error}</p>
            ) : (
              <p className="pl-fine">The demo uses sample data: no sign-in, no wallet, no funds. Signing in asks your wallet for a free signature, not a transaction.</p>
            )}
          </div>

          <div className="pl-split" role="group" aria-label="Who can do what">
            <div className="pl-side pl-ai">
              <h2>Porti can</h2>
              <img className="pl-companion" src="/porti-guide-480.webp" alt="Porti, the anime companion, waving and holding a clipboard" width={480} height={526} />
              <ul>
                {aiCan.map(([verb, rest]) => (
                  <li key={verb}><strong>{verb}</strong> {rest}</li>
                ))}
              </ul>
              <div className="pl-review" aria-hidden>
                <span className="pl-review-title">Send 0.05 NEAR to @bob</span>
                <span className="pl-review-meta">bob.near · verified · prepared by Porti</span>
                <span className="pl-review-stamp">Not signed</span>
              </div>
            </div>

            <div className="pl-line" aria-hidden>
              <span className="pl-line-lock"><Lock size={16} /></span>
              <span className="pl-line-label">signature line</span>
            </div>

            <div className="pl-side pl-you">
              <h2>Only you can</h2>
              <ul>
                {youCan.map(([verb, rest]) => (
                  <li key={verb}><strong>{verb}</strong> {rest}</li>
                ))}
              </ul>
              <div className="pl-wallet" aria-hidden>
                <span className="pl-wallet-account">alice.near</span>
                <span className="pl-wallet-line">Transfer 0.05 NEAR to bob.near</span>
                <span className="pl-wallet-approve">Approve in wallet</span>
              </div>
            </div>
          </div>
        </section>

        <section id="pocket" className="pl-pocket" aria-labelledby="pl-pocket-title">
          <div className="pl-pocket-copy">
            <h2 id="pl-pocket-title">One thing sits on the line: your phone pocket.</h2>
            <p>
              Porti Pocket lets you spend small amounts of NEAR from any phone by dialing a USSD code. No
              smartphone or data plan needed. It spends from a small, capped account that your main wallet
              sets up. The caps live in the contract, not in Porti’s server.
            </p>
            <button type="button" className="pl-btn" onClick={() => onDemo("Phone pocket")}>
              <Phone size={18} aria-hidden /> Dial the simulator
            </button>
          </div>
          <div className="pl-pocket-visual">
            <dl className="pl-caps" aria-label="Demo pocket limits">
              <div><dt>Per send</dt><dd>0.1 NEAR</dd></div>
              <div><dt>Per day</dt><dd>0.3 NEAR</dd></div>
              <div><dt>Server key may call</dt><dd>send, freeze</dd></div>
              <div><dt>Only your wallet may</dt><dd>withdraw, unfreeze, change limits</dd></div>
              <p className="pl-caps-note">Limits of the demo pocket. You choose your own.</p>
            </dl>
            <figure className="pl-lcd">
              <pre>{"Spendable: 1.048 NEAR\nToday left: 0.3 of 0.3 NEAR\nMax per send: 0.1 NEAR"}</pre>
              <figcaption>Balance screen from the simulator, local chain</figcaption>
            </figure>
          </div>
        </section>

        <section id="proof" className="pl-proof" aria-labelledby="pl-proof-title">
          <h2 id="pl-proof-title">We tried to cross the line.</h2>
          <p className="pl-section-lede">
            With the phone server’s own key, against a real pocket contract on a local NEAR chain, 11 November
            2026. Mainnet runs come next.
          </p>
          <ol className="pl-attempts">
            {attempts.map(([label, ok, why]) => (
              <li key={label} className={ok ? "ok" : "no"}>
                <span className="pl-attempt-icon" aria-hidden>{ok ? <Check size={18} /> : <X size={18} />}</span>
                <span className="pl-attempt-label">{label}</span>
                <span className="pl-attempt-result"><strong>{ok ? "Allowed" : "Refused"}</strong> {why}</span>
              </li>
            ))}
          </ol>
        </section>

        <section id="ledger" className="pl-ledger" aria-labelledby="pl-ledger-title">
          <h2 id="pl-ledger-title">What’s verified. What isn’t yet.</h2>
          <div className="pl-ledger-cols">
            <div>
              <h3><ShieldCheck size={20} aria-hidden /> Verified</h3>
              <ul>{verified.map((v) => <li key={v}>{v}</li>)}</ul>
            </div>
            <div>
              <h3><Clock size={20} aria-hidden /> Not yet</h3>
              <ul>{notYet.map((v) => <li key={v}>{v}</li>)}</ul>
            </div>
          </div>
        </section>

        <section className="pl-close" aria-labelledby="pl-close-title">
          <img src="/porti-guide-480.webp" alt="" width={480} height={526} loading="lazy" />
          <div>
            <h2 id="pl-close-title">Porti brings the clipboard. You keep the pen.</h2>
            <div className="pl-ctas">
              <button type="button" className="pl-btn" onClick={() => onDemo()}>Try demo <ArrowRight size={18} aria-hidden /></button>
              <button type="button" className="pl-btn pl-btn-ghost" onClick={onSignIn} disabled={signingIn}>
                <Wallet size={18} aria-hidden /> Sign in with NEAR wallet
              </button>
            </div>
          </div>
        </section>
      </main>

      <footer className="pl-foot">
        <p>Porti is an independent project built for the NEAR Hackathon 2026. NEAR mainnet only. Integrations don’t imply partnerships.</p>
        <p>Onchain data attribution: NearBlocks.</p>
      </footer>
    </div>
  );
}
