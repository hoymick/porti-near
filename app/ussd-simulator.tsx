"use client";
// Feature-phone simulator for Porti Pocket. Posts the same fields Africa's
// Talking sends (sessionId, serviceCode, phoneNumber, cumulative text) to the
// public /api/ussd/sim route, which accepts only +999 test numbers.
import { useEffect, useRef, useState } from "react";
import { Phone, PhoneOff, Delete } from "lucide-react";
import { browserRequestId } from "../lib/browser-request-id.mjs";
import "./ussd-simulator.css";

const SERVICE_CODE = "*384*1#";
const KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "*", "0", "#"];
type Screen =
  | { kind: "idle" }
  | { kind: "waiting" }
  | { kind: "open"; text: string }
  | { kind: "closed"; text: string }
  | { kind: "error"; text: string };

export default function UssdSimulator() {
  const [phone, setPhone] = useState("+999000001");
  const [screen, setScreen] = useState<Screen>({ kind: "idle" });
  const [input, setInput] = useState("");
  const [trail, setTrail] = useState<string[]>([]);
  const session = useRef("");
  const field = useRef<HTMLInputElement>(null);
  const phoneOK = /^\+999\d{5,12}$/.test(phone);
  const open = screen.kind === "open";
  const busy = screen.kind === "waiting";

  useEffect(() => {
    if (open) field.current?.focus();
  }, [open]);

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
            Only <strong>+999</strong> numbers work here. They are test numbers and can only be linked to simulator pockets.
          </p>
          <h3>Try it</h3>
          <ol>
            <li>Press the green call button.</li>
            <li>Reply <strong>1</strong> for Balance: what you can spend and how much of today’s limit is left.</li>
            <li>Call again and reply <strong>2</strong> to send: type a Porti username (<strong>bob</strong> on the local sandbox), an amount like <strong>0.05</strong>, then the PIN (<strong>1234</strong> on the local sandbox).</li>
            <li>Reply <strong>3</strong> for your last 3 sends, or <strong>4</strong> to freeze the pocket. Only the main wallet can unfreeze it.</li>
          </ol>
          <h3>SMS inbox</h3>
          <p className="sc-fine">No messages yet. Codes and send receipts will appear here.</p>
        </div>
      </div>
    </section>
  );
}
