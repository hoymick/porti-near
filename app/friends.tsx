"use client";
import {browserRequestId} from '../lib/browser-request-id.mjs';
import ImageUpload from "./image-upload";
import ChatMessage from './chat-message';
import GroupChats from './group-chats';
import React, { useEffect, useRef, useState } from "react";
export default function Friends({ sample = false,onProfile }: { sample?: boolean;onProfile?:()=>void }) {
  const [tab,setTab]=useState('friends'),[notice,setNotice]=useState('');
  const guard=useRef(false);
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
    return () => {clearInterval(timer);epoch.current++;};
  }, [pair, sample]);
  async function act(action: string, extra: any = {}) {
    if(guard.current||sample)return;guard.current=true;setNotice('');
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
      setNotice(({request:'Friend request sent.',accept:'Friend request accepted. You can now chat.',send:'Message sent.',cancel:'Request cancelled.',decline:'Request declined.',remove:'Friend removed.',block:'User blocked.',unblock:'User unblocked. A new request is required after the cooldown.'} as Record<string,string>)[action]||'Done.');
      if(action==='request')setName('');
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
      guard.current=false;
      setBusy(false);
    }
  }
  const friend = state?.links?.find((x: any) => x.pair === pair);
  if(state?.profileRequired)return <section className="sc-panel"><h2>Start with your Porti username.</h2><p>Claim a username and verify your NEAR wallet in Profile. Friends will find you by that exact @username.</p>{onProfile&&<button className="primary" onClick={onProfile}>Open Profile</button>}<p className="sc-fine">Your friend also needs their own profile and permission to access this deployment. A GitHub invitation does not grant app access.</p></section>;
  return (<div className="porti-social"><div className="sc-buttons porti-social-tabs" role="group" aria-label="Chat sections"><button className={tab==='friends'?'primary':'secondary'} disabled={busy} aria-pressed={tab==='friends'} onClick={()=>setTab('friends')}>Friends & requests{state?.links?.some((f:any)=>f.status==='pending'&&!f.outgoing)?' · New':''}</button><button className={tab==='groups'?'primary':'secondary'} disabled={busy||sample||!state} aria-pressed={tab==='groups'} onClick={()=>setTab('groups')}>Group chats</button></div>{notice&&<p className="sc-notice" role="status">{notice}</p>}{tab==='groups'?<GroupChats sample={sample}/>:(
    <div className="porti-social-grid">
      <section className="sc-panel">
        <span className="sc-eyebrow">YOUR ONCHAIN CIRCLE</span>
        <h2>Good company. Clear signals.</h2>
        <p>
          {state&&<>Your username is <strong>@{state.username}</strong>. </>}Add a verified Porti username. Only accepted friends can message each
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
            required disabled={busy||sample||!state}
          />
          <button className="primary" disabled={busy || sample || !state || !name.trim()}>
            Send friend request
          </button>
        </form>
        <div className="porti-friend-list">
          {!state&&!sample&&<p role="status">Loading your circle…</p>}
          {state?.links?.length===0&&<p>No friends yet. Send a request or share your @username.</p>}
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
                    disabled={busy}
                    onClick={() => {
                      setState((s: any) => ({ ...s, messages: [] }));
                      setText('');setImage(null);selected.current=f.pair;
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
                      onClick={() => act(f.status==='pending'?(f.outgoing?'cancel':'decline'):'remove', { pair: f.pair })}
                    >
                      {f.status === "pending" ? f.outgoing?'Cancel request':'Decline' : "Remove friend"}
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
          Your friend also needs access to this deployment and a linked profile. A GitHub collaborator invitation does not grant app access.
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
              <ChatMessage message={m} name={'@'+friend?.username} key={m.id}/>
            ))}
          {!pair && <p>Choose an accepted friend to open your chat.</p>}
          {pair&&state?.pair===pair&&state.messages?.length===0&&<p>No messages yet. Say hello.</p>}
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
            maxLength={image?1000:2000}
            onChange={(e) => setText(e.target.value)}
            disabled={!pair || sample || busy}
          />
          <button
            className="primary"
            disabled={busy || sample || !pair || (!text.trim()&&!image)}
          >
            Send message
          </button>
        </form>
      </section>
    </div>)}</div>
  );
}
