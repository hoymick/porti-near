"use client";
import {browserRequestId} from '../lib/browser-request-id.mjs';
import ImageUpload from "./image-upload";
import React, { useEffect, useRef, useState } from "react";
export default function Friends({ sample = false }: { sample?: boolean }) {
  const [state, setState] = useState<any>(null),
    [pair, setPair] = useState(""),
    [name, setName] = useState(""),
    [text, setText] = useState(""),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false),[image,setImage]=useState<any>(null);
  const outbound = useRef<any>(null),
    epoch = useRef(0);
  const selected = useRef("");
  selected.current = pair;
  async function refresh(p = pair) {
    if (sample) return;
    const current = ++epoch.current;
    const r = await fetch(
        "/api/porti/friends" + (p ? "?pair=" + encodeURIComponent(p) : ""),
        { cache: "no-store" },
      ),
      d: any = await r.json();
    if (!r.ok) {
      if (selected.current === p && current === epoch.current)
        setState((s: any) => (s ? { ...s, messages: [] } : s));
      throw new Error(d.error?.message || "Friends unavailable.");
    }
    if (selected.current === p && current === epoch.current) setState(d);
  }
  useEffect(() => {
    setImage(null);
    setError("");
    refresh(pair).catch((e) => setError(e.message));
    const timer = setInterval(() => {
      if (!document.hidden) refresh(pair).catch((e) => setError(e.message));
    }, 10000);
    return () => clearInterval(timer);
  }, [pair, sample]);
  async function act(action: string, extra: any = {}) {
    setBusy(true);
    setError("");
    try {
      if (action === "send") {
        const pending = outbound.current;
        if (pending?.pair === pair && pending.text === extra.text && pending.imageId === extra.imageId)
          extra = { ...extra, id: pending.id };
        else outbound.current = { pair, text: extra.text, imageId:extra.imageId, id: extra.id };
      }
      const r = await fetch("/api/porti/friends", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ action, pair, ...extra }),
        }),
        d: any = await r.json();
      if (!r.ok) throw new Error(d.error?.message || "Action failed.");
      if (action === "send") {
        setText("");setImage(null);
        outbound.current = null;
      }
      if (
        ["remove", "block", "decline", "unblock", "cancel"].includes(action)
      ) {
        setPair("");
        selected.current = "";
        await refresh("");
      } else await refresh();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  const friend = state?.links?.find((x: any) => x.pair === pair);
  return (
    <div className="sc-two-col">
      <section className="sc-panel">
        <span className="sc-eyebrow">YOUR ONCHAIN CIRCLE</span>
        <h2>Good company. Clear signals.</h2>
        <p>
          Add a verified Porti username. Only accepted friends can message each
          other.
        </p>
        {sample && (
          <p>Friends are available in Live mode after linking your profile.</p>
        )}
        {error && <p role="alert">{error}</p>}
        <form
          className="sc-form"
          onSubmit={(e) => {
            e.preventDefault();
            act("request", { username: name });
          }}
        >
          <label htmlFor="friend-username">Porti username</label>
          <input
            id="friend-username"
            value={name}
            maxLength={21}
            onChange={(e) => setName(e.target.value)}
            placeholder="@yourfriend"
            required
          />
          <button className="primary" disabled={busy || sample}>
            Send friend request
          </button>
        </form>
        <div className="porti-friend-list">
          {state?.links?.map((f: any) => (
            <article key={f.pair}>
              <strong>@{f.username}</strong>
              <small>
                {f.status === "pending"
                  ? f.outgoing
                    ? "Request sent"
                    : "Wants to be friends"
                  : f.status}
              </small>
              <div className="sc-buttons">
                {f.status === "accepted" && (
                  <button
                    className="secondary"
                    onClick={() => {
                      setState((s: any) => ({ ...s, messages: [] }));
                      setPair(f.pair);
                    }}
                  >
                    Chat
                  </button>
                )}
                {f.status === "pending" && !f.outgoing && (
                  <button
                    className="primary"
                    disabled={busy}
                    onClick={() => act("accept", { pair: f.pair })}
                  >
                    Accept
                  </button>
                )}
                {["pending", "accepted"].includes(f.status) && (
                  <>
                    <button
                      className="secondary"
                      disabled={busy}
                      onClick={() => act("remove", { pair: f.pair })}
                    >
                      {f.status === "pending" ? "Dismiss" : "Remove"}
                    </button>
                    <button
                      className="secondary"
                      disabled={busy}
                      onClick={() => act("block", { pair: f.pair })}
                    >
                      Block
                    </button>
                  </>
                )}
                {f.status === "blocked" && f.blockedByMe && (
                  <button
                    className="secondary"
                    onClick={() => act("unblock", { pair: f.pair })}
                  >
                    Unblock
                  </button>
                )}
              </div>
            </article>
          ))}
        </div>
        <p className="sc-fine">
          Your friend also needs access to this private Site. A GitHub
          collaborator invitation does not grant Site access.
        </p>
      </section>
      <section className="sc-panel">
        <span className="sc-eyebrow">ONE TO ONE</span>
        <h2>{friend ? "@" + friend.username : "A little conversation."}</h2>
        <p>
          Messages are stored on the server with 90-day visible history and are
          not end-to-end encrypted. Never share secrets or recovery phrases.
        </p>
        <div
          className="porti-friend-messages"
          role="log"
          aria-label="Friend messages"
        >
          {state?.pair === pair &&
            state.messages?.map((m: any) => (
              <article className={m.mine ? "mine" : ""} key={m.id}>
                <small>
                  {m.mine ? "You" : "@" + friend?.username} ·{" "}
                  {new Date(m.createdAt).toLocaleTimeString()}
                </small>
                {(()=>{try{const a=JSON.parse(m.body);if(typeof a.portiImage==="string"&&/^[a-f0-9-]{36}$/.test(a.portiImage))return <><img className="porti-chat-image" src={"/api/porti/images?id="+a.portiImage} alt="Shared photo"/><p>{a.caption}</p></>}catch{}return <p>{m.body}</p>})()}
              </article>
            ))}
          {!pair && <p>Choose an accepted friend to open your chat.</p>}
        </div>
        <form
          className="sc-form"
          onSubmit={(e) => {
            e.preventDefault();
            act("send", { text, imageId:image?.imageId, id: browserRequestId() });
          }}
        >
          <ImageUpload scope="friend" pair={pair} disabled={busy||sample||!pair} onUpload={setImage}/>{image&&<div><img className="porti-chat-image" src={image.url} alt="Photo ready to send"/><button type="button" onClick={()=>setImage(null)}>Remove picture</button></div>}<label htmlFor="friend-message">Message</label>
          <textarea
            id="friend-message"
            value={text}
            maxLength={2000}
            onChange={(e) => setText(e.target.value)}
            disabled={!pair || sample}
          />
          <button
            className="primary"
            disabled={busy || sample || !pair || (!text.trim()&&!image)}
          >
            Send message
          </button>
        </form>
      </section>
    </div>
  );
}
