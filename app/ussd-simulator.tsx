"use client";
// Feature-phone simulator for Porti Pocket. Posts the same fields Africa's
// Talking sends (sessionId, serviceCode, phoneNumber, cumulative text) to the
// public /api/ussd/sim route, which accepts only +999 test numbers.
import { useEffect, useRef, useState } from "react";
import { Phone, PhoneOff, Delete, ExternalLink } from "lucide-react";
import { browserRequestId } from "../lib/browser-request-id.mjs";
import "./ussd-simulator.css";

const SERVICE_CODE = "*384*1#";
const KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "*", "0", "#"];
type SimInfo = {
  network: string;
  explorer: string | null;
  pocket: string | null;
  recipients: { username: string; wallet: string }[];
  demoPin: string | null;
};
type Tx = { hash: string; label: string; at: number };
const TX_KEY = "porti-sim-txs";
type Screen =
  | { kind: "idle" }
  | { kind: "waiting" }
  | { kind: "open"; text: string }
  | { kind: "closed"; text: string }
  | { kind: "error"; text: string };

export default function UssdSimulator() {
  const [phone, setPhone] = useState("+999000001");
  // Each visitor gets their own test number, so their PIN tries and history are their own.
  useEffect(() => {
    let n: string | null = null;
    try {
      n = localStorage.getItem("porti-sim-phone");
      if (!n || !/^\+999\d{6}$/.test(n)) {
        n = "+999" + String(crypto.getRandomValues(new Uint32Array(1))[0] % 1_000_000).padStart(6, "0");
        localStorage.setItem("porti-sim-phone", n);
      }
    } catch {
      /* private mode: keep the default number */
    }
    if (n) setPhone(n);
  }, []);
  const [screen, setScreen] = useState<Screen>({ kind: "idle" });
  const [input, setInput] = useState("");
  const [trail, setTrail] = useState<string[]>([]);
  const [info, setInfo] = useState<SimInfo | null>(null);
  const [txs, setTxs] = useState<Tx[]>([]);
  const session = useRef("");
  const field = useRef<HTMLInputElement>(null);
  const phoneOK = /^\+999\d{5,12}$/.test(phone);
  const open = screen.kind === "open";
  const busy = screen.kind === "waiting";

  useEffect(() => {
    if (open) field.current?.focus();
  }, [open]);

  // Public facts (network, demo pocket, recipients) and this browser's recent transactions.
  useEffect(() => {
    fetch("/api/ussd/sim", { cache: "no-store" })
      .then((r) => (r.ok ? (r.json() as Promise<SimInfo>) : null))
      .then((d) => {
        if (d) setInfo(d);
      })
      .catch(() => {});
    try {
      const saved = JSON.parse(localStorage.getItem(TX_KEY) || "[]");
      if (Array.isArray(saved)) setTxs(saved.filter((t) => typeof t?.hash === "string").slice(0, 5));
    } catch {
      /* no saved transactions */
    }
  }, []);

  function remember(hash: string, text: string) {
    const label = text.split("\n")[0].slice(0, 80);
    setTxs((prev) => {
      const next = [{ hash, label, at: Date.now() }, ...prev.filter((t) => t.hash !== hash)].slice(0, 5);
      try {
        localStorage.setItem(TX_KEY, JSON.stringify(next));
      } catch {
        /* storage unavailable */
      }
      return next;
    });
  }
  const txUrl = (hash: string) => (info?.explorer ? `${info.explorer}/txns/${hash}` : null);
  const lastTx = screen.kind === "closed" ? txs.find((t) => t.at > Date.now() - 30_000) : undefined;
  const bob = info?.recipients?.[0]?.username || "bob";
  const pin = info?.demoPin || "1234";

  async function post(text: string) {
    setScreen({ kind: "waiting" });
    try {
      const r = await fetch("/api/ussd/sim", {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ sessionId: session.current, serviceCode: SERVICE_CODE, phoneNumber: phone, text }),
        cache: "no-store",
      });
      const body = (await r.text()).slice(0, 400);
      const hash = r.headers.get("X-Porti-Tx");
      if (hash && /^[1-9A-HJ-NP-Za-km-z]{32,64}$/.test(hash) && body.startsWith("END ")) remember(hash, body.slice(4));
      if (body.startsWith("CON ")) setScreen({ kind: "open", text: body.slice(4) });
      else if (body.startsWith("END ")) setScreen({ kind: "closed", text: body.slice(4) });
      else setScreen({ kind: "error", text: "Network error. The simulator could not reach Porti." });
    } catch {
      setScreen({ kind: "error", text: "Network error. The simulator could not reach Porti." });
    }
  }

  function dial() {
    if (!phoneOK || busy) return;
    session.current = "sim-" + browserRequestId();
    setTrail([]);
    setInput("");
    post("");
  }

  function reply() {
    if (!open || !input.trim()) return;
    const next = [...trail, input.trim()];
    setTrail(next);
    setInput("");
    post(next.join("*"));
  }

  function hangUp() {
    session.current = "";
    setTrail([]);
    setInput("");
    setScreen({ kind: "idle" });
  }

  function press(k: string) {
    if (open && input.length < 40) setInput(input + k);
  }

  return (
    <section className="sc-panel ussd-sim">
      <span className="sc-eyebrow">PORTI POCKET · USSD SIMULATOR</span>
      <h2>Your pocket, from any phone.</h2>
      <p>
        Dial <strong>{SERVICE_CODE}</strong> the way a feature phone would. The pocket contract
        enforces per-send and daily caps on chain, and only your main wallet can withdraw or change limits.
      </p>
      <div className="ussd-sim-layout">
        <div className="ussd-phone" aria-label="Simulated feature phone">
          <div className="ussd-phone-badge">SIMULATOR</div>
          <div className="ussd-screen" role="log" aria-live="polite">
            {screen.kind === "idle" && (
              <p className="ussd-muted">
                {phone}
                <br />
                Press call to dial {SERVICE_CODE}
              </p>
            )}
            {screen.kind === "waiting" && <p className="ussd-muted">Running USSD code...</p>}
            {(screen.kind === "open" || screen.kind === "closed" || screen.kind === "error") && (
              <pre>{screen.text}</pre>
            )}
            {open && (
              <input
                ref={field}
                className="ussd-entry"
                aria-label="USSD reply"
                value={input}
                maxLength={40}
                onChange={(e) => setInput(e.target.value.replace(/[^A-Za-z0-9_@.#]/g, ""))}
                onKeyDown={(e) => {
                  if (e.key === "Enter") reply();
                  if (e.key === "Escape") hangUp();
                }}
                placeholder="Type a reply"
              />
            )}
            {open && (
              <div className="ussd-softkeys">
                <button type="button" onClick={hangUp}>Cancel</button>
                <button type="button" onClick={reply} disabled={!input.trim()}>Send</button>
              </div>
            )}
            {(screen.kind === "closed" || screen.kind === "error") && (
              <div className="ussd-softkeys">
                <button type="button" onClick={hangUp}>OK</button>
              </div>
            )}
          </div>
          <div className="ussd-controls">
            <button type="button" className="ussd-call" aria-label="Call" onClick={dial} disabled={!phoneOK || busy || open}>
              <Phone size={18} />
            </button>
            <button type="button" className="ussd-back" aria-label="Delete last character" onClick={() => setInput(input.slice(0, -1))} disabled={!open || !input}>
              <Delete size={18} />
            </button>
            <button type="button" className="ussd-end" aria-label="End call" onClick={hangUp}>
              <PhoneOff size={18} />
            </button>
          </div>
          <div className="ussd-keypad">
            {KEYS.map((k) => (
              <button key={k} type="button" onClick={() => press(k)} disabled={!open}>
                {k}
              </button>
            ))}
          </div>
        </div>
        <div className="ussd-side">
          <label>
            Test phone number
            <input
              value={phone}
              onChange={(e) => setPhone(e.target.value.replace(/[^+\d]/g, ""))}
              disabled={open || busy}
              aria-invalid={!phoneOK}
            />
          </label>
          <p className="sc-fine">
            Only <strong>+999</strong> test numbers work here. They use a shared demo pocket on <strong>NEAR testnet</strong>: free test NEAR, the same contract and limits as mainnet.
          </p>
          <h3>Try it</h3>
          <ol>
            <li>Press the green call button.</li>
            <li>Reply <strong>1</strong> for Balance: what you can spend and how much of today’s limit is left.</li>
            <li>Call again and reply <strong>2</strong> to send: type <strong>{bob}</strong>, an amount like <strong>0.05</strong>, then the demo PIN <strong>{pin}</strong>. Three wrong PINs lock sending for 15 minutes.</li>
            <li>Reply <strong>3</strong> for your last 3 sends, or <strong>4</strong> to freeze the pocket. Normally only the main wallet can unfreeze it; this shared demo unfreezes itself after a minute so others can keep testing.</li>
          </ol>
          {lastTx && txUrl(lastTx.hash) && (
            <p className="ussd-tx-now" role="status">
              Transaction submitted.{" "}
              <a href={txUrl(lastTx.hash)!} target="_blank" rel="noreferrer">
                View it on NearBlocks <ExternalLink size={13} aria-hidden />
              </a>
            </p>
          )}
          <h3>Verify it on chain</h3>
          {info?.pocket && info.explorer ? (
            <dl className="ussd-verify">
              <dt>Network</dt>
              <dd>NEAR {info.network}. Free test NEAR, real transactions.</dd>
              <dt>Demo pocket</dt>
              <dd>
                <a href={`${info.explorer}/address/${info.pocket}`} target="_blank" rel="noreferrer">
                  {info.pocket} <ExternalLink size={13} aria-hidden />
                </a>
                <span className="ussd-note">Its contract holds the caps; Balance reads them from the chain.</span>
              </dd>
              {info.recipients.map((r) => (
                <div key={r.username}>
                  <dt>@{r.username}</dt>
                  <dd>
                    <a href={`${info.explorer}/address/${r.wallet}`} target="_blank" rel="noreferrer">
                      {r.wallet} <ExternalLink size={13} aria-hidden />
                    </a>
                  </dd>
                </div>
              ))}
              <dt>Your transactions</dt>
              <dd>
                {txs.length ? (
                  <ul>
                    {txs.map((t) => (
                      <li key={t.hash}>
                        <a href={txUrl(t.hash) || "#"} target="_blank" rel="noreferrer">
                          {t.label} <code>{t.hash.slice(0, 8)}</code> <ExternalLink size={13} aria-hidden />
                        </a>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <span className="sc-fine">Sends and freezes you make here appear with a link to each transaction.</span>
                )}
              </dd>
            </dl>
          ) : (
            <p className="sc-fine">
              {info?.network === "local sandbox"
                ? "Running on a private local NEAR sandbox, so there is no public explorer."
                : "The demo pocket is not configured on this server yet."}
            </p>
          )}
          <h3>SMS inbox</h3>
          <p className="sc-fine">No messages yet. Codes and send receipts will appear here.</p>
        </div>
      </div>
    </section>
  );
}
