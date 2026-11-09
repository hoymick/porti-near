"use client";
import {browserRequestId} from '../lib/browser-request-id.mjs';
import React, { useEffect, useRef, useState } from "react";
import {
  ArrowRight,
  ArrowUpRight,
  Bell,
  Bot,
  Check,
  ChevronRight,
  Coins,
  Copy,
  Eye,
  ExternalLink,
  Home,
  Info,
  LoaderCircle,
  Menu,
  MessageCircle,
  Network,
  Pause,
  Play,
  PlugZap,
  Plus,
  RefreshCw,
  Search,
  Send,
  Settings2,
  ShieldCheck,
  Sparkles,
  Trash2,
  UserRound,
  Wallet,
  X,
} from "lucide-react";
import Charity from "./charity";
import ThemeControl from "./theme-control";
import SystemStatus from "./system-status";
import PortiApps from "./porti-apps";
import Staking from "./staking";
import Swaps from "./swaps";
import Markets from "./markets";
import BuyNear from "./buy-near";
import XConnect from "./x-connect";
import "./media.css";
import PortiNavigation from "./porti-navigation";
import "./porti-navigation.css";
import "./porti-apps.css";
import WalletHub from "./wallet-hub";
import EmbeddedWalletHost from "./embedded-wallet-host";
import Friends from "./friends";
import TelegramSettings from "./telegram-settings";
import TokenChart from "./token-chart";
import PortiCompanion from "./porti-companion";
import TokenRiskPanel from "./token-risk";
import { nearDemo } from "../lib/near-demo.mjs";
import { decimal, nearAccountOK } from "../lib/near-core.mjs";
import { tokenRisk } from "../lib/token-risk.mjs";
const navigation = [
  ["Overview", Home],
  ["Porti Apps", Network],
  ["Ask Porti", MessageCircle],
  ["Investigate token", Search],
  ["Track wallet", Wallet],
  ["Rug Guard", ShieldCheck],
  ["Watchlist", Eye],
  ["Wallets", Wallet],
  ["Stake NEAR", Coins],
  ["Buy NEAR", Coins],
  ["Swap", Coins],
  ["Markets", Coins],
  ["Transfers", Send],
  ["Telegram", Bell],
  ["Friends", MessageCircle],
  ["Porti Care", ShieldCheck],
  ["Alerts", Bell],
  ["Profile", UserRound],
  ["Connections", PlugZap],
  ["System status", Settings2],
] as const;
const when = (n: any) =>
  n
    ? new Date(n).toLocaleString([], {
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      })
    : "Not checked";
const accountLabel = (a: string) =>
  a?.length > 26 ? `${a.slice(0, 13)}…${a.slice(-8)}` : a;
async function request(body?: any) {
  const r = await fetch("/api/porti", {
    method: body ? "POST" : "GET",
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
    cache: "no-store",
  });
  const d: any = await r.json();
  if (!r.ok)
    throw new Error(d.error?.message || "This request could not complete.");
  return d;
}
export default function NearWorkspace({ signedIn }: { signedIn: boolean }) {
  const [view, setView] = useState("Overview"),
    [state, setState] = useState<any>(null),
    [profile, setProfile] = useState<any>(null),
    [busy, setBusy] = useState(""),
    [error, setError] = useState(""),
    [message, setMessage] = useState(""),
    [openChat, setOpenChat] = useState(false),
    [walletLocation,setWalletLocation] = useState<"modal" | "chat" | null>(null),
    [sample, setSample] = useState(false),
    [demo, setDemo] = useState<any>(null),
    [account, setAccount] = useState(""),
    [report, setReport] = useState<any>(null),
    [contextToken, setContextToken] = useState(""),
    [draft, setDraft] = useState<any>(null),
    [reviewed, setReviewed] = useState(false),
    [wallet, setWallet] = useState<any>(null),
    [walletAccount, setWalletAccount] = useState(""),
    [username, setUsername] = useState(""),
    [menu, setMenu] = useState(false),
    [search, setSearch] = useState(""),
    [connection, setConnection] = useState({
      key: "",
      model: "zai-org/GLM-5.1-FP8",
      index: "",
      rpc: "",
    }),
    [form, setForm] = useState({
      recipient: "",
      token: "near",
      amount: "50",
      denomination: "usd",
    }),
    [receiptHash, setReceiptHash] = useState(""),
    [expired, setExpired] = useState(false),
    [profileConsent, setProfileConsent] = useState(false);
  const transferRequest = useRef({
    id: browserRequestId(),
    expiresAt: Date.now() + 180000,
  });
  useEffect(() => {
    transferRequest.current = {
      id: browserRequestId(),
      expiresAt: Date.now() + 180000,
    };
  }, [form, walletAccount]);
  const connector = useRef<any>(null),
    guard = useRef(false),
    refreshAt = useRef(0),
    modalRef = useRef<HTMLElement>(null);
  const p = state || {
      messages: [],
      watches: [],
      snapshots: {},
      alerts: [],
      receipts: [],
      drafts: [],
    },
    watches = sample ? demo?.watches || [] : p.watches,
    snapshots = sample
      ? { ["token:" + demo?.snapshot.address]: demo?.snapshot }
      : p.snapshots,
    tokens = Object.values(snapshots || {}).filter(
      (s: any) => s?.kind === "token",
    ) as any[],
    alerts = sample ? demo?.alerts || [] : p.alerts;
  function accept(d: any) {
    if (d.porti) setState(d.porti);
    if ("profile" in d) setProfile(d.profile);
  }
  useEffect(() => {
    const token = new URL(window.location.href).searchParams.get("token");
    if(new URL(window.location.href).searchParams.get("screen")==="status")setView("System status");
    if(new URL(window.location.href).searchParams.get("screen")==="apps")setView("Porti Apps");
    if(new URL(window.location.href).searchParams.get("screen")==="staking")setView("Stake NEAR");
    if(new URL(window.location.href).searchParams.get("screen")==="profile")setView("Profile");
    if(new URL(window.location.href).searchParams.get("screen")==="buy")setView("Buy NEAR");
    if(new URL(window.location.href).searchParams.get("screen")==="swap")setView("Swap");
    if(new URL(window.location.href).searchParams.get("screen")==="markets")setView("Markets");
    if (nearAccountOK(token)) {
      setView("Investigate token");
      setAccount(token!);
      setContextToken(token!);
    }
  }, []);
  useEffect(() => {
    setDemo(nearDemo());
    if (signedIn)
      request()
        .then(accept)
        .catch((e) => setError(e.message));
  }, [signedIn]);
  async function act(body: any) {
    if (guard.current) return;
    guard.current = true;
    setBusy(body.action);
    setError("");
    setMessage("");
    try {
      const d = await request(body);
      accept(d);
      if (d.message) setMessage(d.message);
      return d;
    } catch (e: any) {
      setError(e.message);
    } finally {
      guard.current = false;
      setBusy("");
    }
  }
  function go(v: string) {
    setView(v);
    setMenu(false);
    setError("");
    setMessage("");
    setAccount("");
    if (v === "Ask Porti") setOpenChat(true);
  }
  function openReport(s: any) {
    setReport(s);
    if (s.kind === "token" && !sample) setContextToken(s.address);
  }
  function openDraft(d: any) {
    setDraft(d);
    setReviewed(false);
    setReceiptHash(d.hash || "");
    setExpired(Date.now() > d.expiresAt);
  }
  useEffect(() => {
    if (!draft) return;
    const timer = setInterval(
      () => setExpired(Date.now() > draft.expiresAt),
      1000,
    );
    return () => clearInterval(timer);
  }, [draft]);
  useEffect(() => {
    if (!report && !draft) return;
    const prev = document.activeElement as HTMLElement | null;
    const node = modalRef.current;
    node?.querySelector<HTMLButtonElement>("button")?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !guard.current) {
        setReport(null);
        setDraft(null);
      }
      if (e.key === "Tab" && node) {
        const focusable = Array.from(
            node.querySelectorAll<HTMLElement>(
              'button:not(:disabled),input:not(:disabled),select,a[href],[tabindex="0"]',
            ),
          ),
          first = focusable[0],
          last = focusable.at(-1);
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last?.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first?.focus();
        }
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      prev?.focus();
    };
  }, [report, draft]);
  async function connect(role: string = "main") {
    if (sample) {
      setError("Switch to Live before connecting a wallet.");
      return;
    }
    if (guard.current) return;
    guard.current = true;
    setBusy("connect");
    setError("");
    try {
      if (!connector.current) {
        const { NearConnector } = await import("@hot-labs/near-connect");
        connector.current = new NearConnector({
          network: "mainnet",
          autoConnect: false,
          features: { signMessage: true, signAndSendTransaction: true },
        });
        connector.current.on("wallet:signOut", () => {
          setWallet(null);
          setWalletAccount("");
        });
        connector.current.on("wallet:signIn", (event: any) => {
          setWallet(event.wallet);
          setWalletAccount(event.accounts?.[0]?.accountId || "");
        });
      }
      const w = await connector.current.connect();
      const accounts = await w.getAccounts();
      if (!nearAccountOK(accounts?.[0]?.accountId))
        throw new Error("Select a NEAR mainnet account.");
      setWallet(w);
      setWalletAccount(accounts[0].accountId);
      if (role === "main" || role === "agent") {
        const d = await request({
          action: "wallet-challenge",
          role,
          account: accounts[0].accountId,
        });
        const c = d.challenge;
        const proof = await w.signMessage({
          message: c.message,
          recipient: c.recipient,
          nonce: Uint8Array.from(atob(c.nonce), (x) => x.charCodeAt(0)),
          network: "mainnet",
          signerId: accounts[0].accountId,
        });
        const done = await request({ action: "wallet-verify", role, proof });
        accept(done);
        setMessage(done.message);
      }
    } catch (e: any) {
      setError(e.message || "Wallet connection cancelled.");
    } finally {
      guard.current = false;
      setBusy("");
    }
  }
  async function useEmbeddedWallet(w: any) {
    if (guard.current || sample) return false;
    guard.current = true; setBusy("embedded-verify"); setError("");
    try {
      const accounts = await w.getAccounts(), account = accounts[0]?.accountId;
      if (!nearAccountOK(account)) throw Error("Select a valid NEAR mainnet wallet before verifying.");
      if(account === p.walletRoles?.main?.account)throw Error("Use a different account from your main wallet for the agent role.");
      const d=await request({action:"wallet-challenge",role:"agent",account,proofMode:w.proofMode}), c=d.challenge;
      const proof=await w.signMessage({message:c.message,recipient:c.recipient,nonce:Uint8Array.from(atob(c.nonce),x=>x.charCodeAt(0)),network:"mainnet",signerId:account});
      const done=await request({action:"wallet-verify",role:"agent",proof});accept(done);setWallet(w);setWalletAccount(account);setMessage(done.message);return true;
    }catch(e:any){setError(e.message||"Internal wallet ownership verification failed.");return false}finally{guard.current=false;setBusy("")}
  }
  async function sendChat(text: string, imageId?: string) {
    if (sample) {
      setError("Switch to Live for actual NEAR AI chat.");
      return false;
    }
    const d = await act({
      action: "chat",
      message: text,
      imageId,
      requestId: browserRequestId(),
      wallet: walletAccount,
      contextToken,
    });
    if (d) setOpenChat(true);
    return !!d;
  }
  async function investigate(e?: React.FormEvent, kind?: string, a?: string) {
    e?.preventDefault();
    const k = kind || (view === "Track wallet" ? "wallet" : "token"),
      value = (a || account).trim();
    if (sample) {
      if (k === "token") openReport(demo.snapshot);
      else
        setError(
          "The walkthrough includes a token fixture only. Switch to Live to inspect a real wallet.",
        );
      return;
    }
    if (k === "token" && nearAccountOK(value)) setContextToken(value);
    const d = await act({ action: "investigate", kind: k, account: value });
    if (d?.snapshot) openReport(d.snapshot);
    else if (k === "token" && nearAccountOK(value)) setContextToken(value);
  }
  async function watch(kind: string, address: string, label = "") {
    if (sample) {
      setMessage("Sample mode does not create a live watch.");
      return;
    }
    await act({ action: "watch", kind, account: address, label });
  }
  async function linkProfile(e: React.FormEvent) {
    e.preventDefault();
    if (!wallet || !walletAccount) {
      setError("Connect a NEAR wallet first.");
      return;
    }
    if (!profileConsent) {
      setError(
        "Confirm that this username wallet mapping will be visible to platform users.",
      );
      return;
    }
    const d = await act({
      action: "profile-challenge",
      username: profile?.username || username,
      account: walletAccount,
      proofMode: wallet?.proofMode,
    });
    if (!d) return;
    try {
      const accounts = await wallet.getAccounts();
      if (accounts[0]?.accountId !== walletAccount)
        throw new Error(
          "Wallet account changed. Connect the selected account again.",
        );
      const c = d.challenge,
        proof = await wallet.signMessage({
          message: c.message,
          recipient: c.recipient,
          nonce: Uint8Array.from(atob(c.nonce), (x) => x.charCodeAt(0)),
          network: "mainnet",
          signerId: walletAccount,
        });
      const verified = await act({ action: "verify-profile", proof });
      if (verified)
        setMessage(
          "Wallet ownership verified. Your @username is ready to receive transfers.",
        );
    } catch (e: any) {
      setError(e.message || "Wallet-link signature cancelled.");
    }
  }
  async function prepare(e: React.FormEvent) {
    e.preventDefault();
    if (sample) {
      setError("Transfers are available in Live mode only.");
      return;
    }
    if (transferRequest.current.expiresAt <= Date.now())
      transferRequest.current = {
        id: browserRequestId(),
        expiresAt: Date.now() + 180000,
      };
    const d = await act({
      action: "prepare-transfer",
      requestId: transferRequest.current.id,
      sender: walletAccount,
      ...form,
    });
    if (d?.draft) {
      transferRequest.current.expiresAt = d.draft.expiresAt;
      openDraft(d.draft);
    }
  }
  async function signTransfer() {
    if (!wallet || !reviewed || !draft || expired || guard.current) return;
    guard.current = true;
    setBusy("wallet-approval");
    setError("");
    try {
      const accounts = await wallet.getAccounts();
      if (accounts[0]?.accountId !== draft.sender)
        throw new Error("Connected wallet differs from the reviewed sender.");
      const verified = await request({
        action: "validate-draft",
        draftId: draft.id,
      });
      accept(verified);
      const tx = verified.draft.transaction;
      setDraft(verified.draft);
      // Save the review ID before redirect-capable wallets open; never auto-submit on return.
      sessionStorage.setItem("porti-pending-draft", draft.id);
      const outcome = await wallet.signAndSendTransaction({
        ...tx,
        network: "mainnet",
      });
      const hash = outcome?.transaction?.hash;
      if (!hash) {
        setMessage(
          "Wallet opened. If it redirected, return here and use the transaction hash to verify the outcome.",
        );
        return;
      }
      setReceiptHash(hash);
      const submitted = await request({
        action: "save-transfer-hash",
        draftId: draft.id,
        hash,
      });
      accept(submitted);
      setDraft({ ...verified.draft, status: "submitted", hash });
      setMessage("Wallet returned a hash. Verifying final outcome…");
      const done = await request({
        action: "record-transfer",
        draftId: draft.id,
        hash,
      });
      accept(done);
      setDraft({ ...draft, status: "finalized", hash });
      transferRequest.current = {
        id: browserRequestId(),
        expiresAt: Date.now() + 180000,
      };
      setMessage("Transfer finalized and matched to your reviewed details.");
      sessionStorage.removeItem("porti-pending-draft");
    } catch (e: any) {
      setError(
        e.message ||
          "Wallet approval was cancelled or the transfer could not be verified.",
      );
    } finally {
      guard.current = false;
      setBusy("");
    }
  }
  useEffect(() => {
    if (!state) return;
    try {
      const pending = sessionStorage.getItem("porti-pending-draft"),
        saved = state.drafts.find(
          (d: any) => d.id === pending && d.status !== "finalized",
        );
      if (saved && !draft) openDraft(saved);
    } catch {}
  }, [state]);
  useEffect(() => {
    if (sample || !state) return;
    const timer = setInterval(async () => {
      if (
        document.hidden ||
        guard.current ||
        Date.now() - refreshAt.current < 60000
      )
        return;
      const due = state.watches.find(
        (w: any) =>
          !w.paused &&
          Date.now() -
            (state.snapshots[`${w.kind}:${w.address}`]?.checkedAt || 0) >
            300000,
      );
      if (due) {
        refreshAt.current = Date.now();
        await act({
          action: "investigate",
          kind: due.kind,
          account: due.address,
        });
      }
    }, 30000);
    return () => clearInterval(timer);
  }, [state, sample]);
  async function verifyHash() {
    const d = await act({
      action: "record-transfer",
      draftId: draft.id,
      hash: receiptHash,
    });
    if (d?.receipt) {
      setDraft({ ...draft, status: "finalized", hash: receiptHash });
      transferRequest.current = {
        id: browserRequestId(),
        expiresAt: Date.now() + 180000,
      };
      sessionStorage.removeItem("porti-pending-draft");
      setMessage("Transfer finalized and verified.");
    }
  }
  const heading: any = {
    "Porti Apps": "Your favorite NEAR projects, closer together.",
    "System status": "Connections, acceptance evidence and operational limits.",
    "Markets": "NEAR coins, movers and a curated meme watchlist.",
    "Swap": "NEAR in. Your chosen token out.",
    "Buy NEAR": "Your wallet, funded your way.",
    "Stake NEAR": "Review. Approve. Verify your stake.",
    Wallets: "A home for your NEAR wallets.",
    Friends: "Your circle. Your conversations.",
    "Porti Care": "Real needs. Private evidence. Reviewed donations.",
    Telegram: "A signal wherever you are.",
    "Investigate token": "A contract. A clearer picture.",
    "Track wallet": "Follow an account on NEAR.",
    "Rug Guard": "Check the holders before the hype.",
    Watchlist: "Keep the useful trails close.",
    Transfers: "Say where. Review exactly what.",
    Alerts: "New observations, with context.",
    Profile: "Your name. Your verified wallet.",
    Connections: "Connect the tools behind Porti.",
    "Ask Porti": "Talk to your little onchain guide.",
  };
  return (
    <div className="app-shell scout-app near-app">
      <aside className={`sidebar ${menu ? "sc-open" : ""}`}>
        {/* Full reload intentionally resets the single-page workspace state. */}
        {/* eslint-disable-next-line @next/next/no-html-link-for-pages */}
        <a href="/" className="brand porti-brand">
          <span className="near-brand-icon">✦</span>PORTI
          <span className="near-brand-pill">NEAR</span>
        </a>
        <button
          className="icon-button sc-close-menu"
          aria-label="Close navigation"
          onClick={() => setMenu(false)}
        >
          <X size={19} />
        </button>
        <button className="near-profile-shortcut" onClick={() => go("Profile")}>
          <span className="sc-avatar">
            {profile?.username?.slice(0, 1).toUpperCase() || "P"}
          </span>
          <span>
            {profile ? "@" + profile.username : "Your Porti profile"}
            <small>
              {profile ? "Wallet ownership verified" : "Claim your @username"}
            </small>
          </span>
          <ChevronRight size={13} />
        </button>
        <div className="nav-label">YOUR LITTLE ONCHAIN WORLD</div>
        <PortiNavigation navigation={navigation} view={view} onNavigate={go} unread={alerts.filter((a: any) => !a.read).length} />
        <div className="sidebar-bottom">
          <div className="sc-chain">
            <Network size={19} />
            <div>
              Made for NEAR<small>Mainnet · human-approved actions</small>
            </div>
          </div>
          <button
            className="near-sidebar-chat"
            onClick={() => setOpenChat(true)}
          >
            <img src="/porti-guide.png" alt="" />
            <span>
              A little help?<strong>Just ask Porti.</strong>
            </span>
            <MessageCircle size={15} />
          </button>
          <ThemeControl/>
        <div className="sc-version">
            NEAR AI Cloud<span>v0.14</span>
          </div>
        </div>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <button
            className="sc-mobile-menu icon-button"
            aria-label="Toggle navigation"
            onClick={() => setMenu(!menu)}
          >
            <Menu size={20} />
          </button>
          <div className="breadcrumb">
            Porti’s world
            <ChevronRight size={13} />
            <span>{view}</span>
          </div>
          <div className="near-top-actions">
            <div className="sc-mode">
              <button
                aria-pressed={!sample}
                className={!sample ? "selected" : ""}
                disabled={!!busy}
                onClick={() => {
                  setSample(false);
                  setReport(null);
                  setDraft(null);
                  setError("");
                }}
              >
                Live
              </button>
              <button
                aria-pressed={sample}
                className={sample ? "selected" : ""}
                disabled={!!busy}
                onClick={() => {
                  setSample(true);
                  setReport(null);
                  setDraft(null);
                  setError("");
                }}
              >
                Walkthrough
              </button>
            </div>
            <button
              className="secondary near-connect-button"
              onClick={wallet ? () => go("Profile") : () => connect()}
              disabled={!!busy || sample}
            >
              <Wallet size={15} />
              {walletAccount
                ? accountLabel(walletAccount)
                : "Connect NEAR wallet"}
            </button>
          </div>
        </header>
        <main>
          {sample ? (
            <div className="sc-banner sample">
              <Info size={15} />
              <span>
                <strong>Fictional walkthrough.</strong> No real token data, AI
                responses, wallet links or transfers.
              </span>
            </div>
          ) : (
            <div className="sc-banner">
              <ShieldCheck size={15} />
              <span>
                NEAR mainnet · Porti researches and prepares. Your wallet
                approves transfers.
              </span>
              <button onClick={() => go("Connections")}>
                {state?.aiConfigured ? "NEAR AI configured" : "Connect NEAR AI"}
                <ArrowRight size={13} />
              </button>
            </div>
          )}
          {error && (
            <div className="sc-notice error" role="alert">
              <Info size={18} />
              <span>{error}</span>
              <button aria-label="Dismiss error" onClick={() => setError("")}>
                <X size={16} />
              </button>
            </div>
          )}
          {message && (
            <div className="sc-notice" role="status">
              <Check size={18} />
              <span>{message}</span>
              <button
                aria-label="Dismiss message"
                onClick={() => setMessage("")}
              >
                <X size={16} />
              </button>
            </div>
          )}
          {!signedIn && !sample ? (
            <section className="sc-panel sc-empty">
              <h1>Meet your onchain companion.</h1>
              <p>
                Open a private workspace for NEAR token research, wallet
                profiles and reviewed transfers.
              </p>
              <a
                className="primary"
                href="/signin-with-chatgpt?return_to=/"
                target="_top"
              >
                Open Porti
                <ArrowRight size={16} />
              </a>
            </section>
          ) : (
            <>
              {view === "Overview" ? (
                <>
                  <section className="sc-hero near-hero">
                    <div>
                      <span className="sc-eyebrow">
                        SMALL COMPANION. REAL ONCHAIN TOOLS.
                      </span>
                      <h1>
                        Your NEAR world.
                        <br />
                        <em>A little more human.</em>
                      </h1>
                      <p>
                        Ask Porti to investigate a token, follow a wallet, or
                        prepare a transfer to someone’s @username.
                      </p>
                      <div className="sc-buttons">
                        <button
                          className="primary"
                          onClick={() => setOpenChat(true)}
                        >
                          <Sparkles size={17} />
                          Hi Porti, let’s talk
                          <ArrowUpRight size={16} />
                        </button>
                        <button
                          className="secondary"
                          onClick={() => go("Investigate token")}
                        >
                          <Search size={16} />
                          Explore a token
                        </button>
                      </div>
                      <div className="near-hero-chips">
                        <span>
                          <Check size={12} />
                          NEAR AI Cloud
                        </span>
                        <span>
                          <Check size={12} />
                          You keep your keys
                        </span>
                        <span>
                          <Check size={12} />
                          Evidence first
                        </span>
                      </div>
                    </div>
                    <div className="sc-hero-art">
                      <div className="sc-speech">
                        HEY, I’M PORTI!
                        <strong>
                          You tell me the task.
                          <br />
                          I’ll find the next step.
                        </strong>
                      </div>
                      <img
                        src="/porti-guide.png"
                        alt="Porti, your cheerful anime companion with a mint scarf and clipboard"
                      />
                      <span className="sc-star">✦</span>
                    </div>
                  </section>
                  <section className="sc-stats">
                    <div>
                      <span>
                        Trails you follow
                        <Eye size={17} />
                      </span>
                      <strong>
                        {String(watches.length).padStart(2, "0")}
                        <small>accounts & tokens</small>
                      </strong>
                      <button onClick={() => go("Watchlist")}>
                        Open your watchlist
                        <ArrowRight size={14} />
                      </button>
                    </div>
                    <div>
                      <span>
                        Your identity on Porti
                        <UserRound size={17} />
                      </span>
                      <strong className="near-username-stat">
                        {profile ? "@" + profile.username : "@you"}
                        <small>
                          {profile ? "wallet linked" : "waiting to be claimed"}
                        </small>
                      </strong>
                      <button onClick={() => go("Profile")}>
                        Manage your wallet link
                        <ArrowRight size={14} />
                      </button>
                    </div>
                    <div>
                      <span>
                        Verified transfers
                        <Send size={17} />
                      </span>
                      <strong>
                        {String(sample ? 0 : p.receipts.length).padStart(
                          2,
                          "0",
                        )}
                        <small>finalized on NEAR</small>
                      </strong>
                      <button onClick={() => go("Transfers")}>
                        Every transfer has a review
                        <ArrowRight size={14} />
                      </button>
                    </div>
                  </section>
                  <section className="sc-panel near-command-panel">
                    <div>
                      <span className="sc-eyebrow">SAY IT NATURALLY</span>
                      <h2>“Hi Porti, can you…”</h2>
                      <p>
                        Your chat connects to real tools. Research stays
                        evidence-backed. Money movement stays under your
                        approval.
                      </p>
                    </div>
                    <div className="near-command-grid">
                      <button
                        onClick={() => {
                          setOpenChat(true);
                        }}
                      >
                        <MessageCircle size={20} />
                        <strong>Send $50 worth of NEAR to @michael</strong>
                        <span>
                          Resolve → value → review → wallet approval
                          <ArrowRight size={14} />
                        </span>
                      </button>
                      <button onClick={() => go("Rug Guard")}>
                        <ShieldCheck size={20} />
                        <strong>Show me the token’s warning signs</strong>
                        <span>
                          Available evidence → flags → unanswered checks
                          <ArrowRight size={14} />
                        </span>
                      </button>
                    </div>
                  </section>
                  <div className="sc-two-col">
                    <section className="sc-panel">
                      <div className="sc-section-head">
                        <div>
                          <span className="sc-eyebrow">YOUR FIELD NOTES</span>
                          <h2>What you’re looking into.</h2>
                        </div>
                        <button
                          className="secondary"
                          onClick={() => go("Investigate token")}
                        >
                          <Plus size={14} />
                          Investigate
                        </button>
                      </div>
                      {tokens.length ? (
                        tokens.slice(0, 3).map((s) => (
                          <button
                            className="near-observation"
                            key={s.address}
                            onClick={() => openReport(s)}
                          >
                            <span className="sc-token-avatar">
                              {s.metadata.symbol?.slice(0, 1) || "T"}
                            </span>
                            <span>
                              <strong>{s.metadata.symbol || s.address}</strong>
                              <small>
                                {accountLabel(s.address)} · {when(s.checkedAt)}
                              </small>
                            </span>
                            <span
                              className={`risk-small-badge ${tokenRisk(s).level}`}
                            >
                              {tokenRisk(s).label}
                            </span>
                          </button>
                        ))
                      ) : (
                        <div className="sc-empty">
                          <Search size={30} />
                          <h3>Your first clue is a contract.</h3>
                          <p>
                            Start with wrap.near, or explore the fictional
                            token-risk walkthrough.
                          </p>
                          <div className="sc-buttons">
                            <button
                              className="secondary"
                              onClick={() => {
                                go("Investigate token");
                                setAccount("wrap.near");
                              }}
                            >
                              Use wrap.near
                            </button>
                            <button
                              className="secondary"
                              onClick={() => {
                                setSample(true);
                                setReport(nearDemo().snapshot);
                              }}
                            >
                              Try the walkthrough
                            </button>
                          </div>
                        </div>
                      )}
                    </section>
                    <section className="sc-panel sc-lilac">
                      <span className="sc-eyebrow">
                        LESS COPYING. MORE CLARITY.
                      </span>
                      <h2>
                        Send to a name.
                        <br />
                        Verify the wallet behind it.
                      </h2>
                      <p>
                        Claim a Porti @username and link your NEAR wallet with a
                        signed ownership message. Every transfer review shows
                        the resolved wallet before approval.
                      </p>
                      <div className="near-username-example">
                        <UserRound size={20} />
                        <strong>@michael</strong>
                        <ArrowRight size={16} />
                        <span>michael.near</span>
                      </div>
                      <button
                        className="secondary"
                        onClick={() => go("Profile")}
                      >
                        Create your profile
                        <ArrowRight size={15} />
                      </button>
                      <p className="sc-fine">
                        Example mapping only. Usernames verify wallet control,
                        not real-world identity.
                      </p>
                    </section>
                  </div>
                </>
              ) : (
                <>
                  <div className="sc-page-heading">
                    <span className="sc-eyebrow">PORTI · BUILT FOR NEAR</span>
                    <h1>{view}</h1>
                    <p>{heading[view]}</p>
                  </div>
                  {view === "Ask Porti" && (
                    <section className="sc-panel near-chat-page">
                      <img src="/porti-guide.png" alt="Porti anime companion" />
                      <div>
                        <span className="sc-eyebrow">
                          YOUR MOVABLE ONCHAIN COMPANION
                        </span>
                        <h2>Talk. Research. Review.</h2>
                        <p>
                          Porti can read token metadata and holder observations,
                          follow accounts, resolve @usernames and prepare a
                          transfer. Drag the little Porti button anywhere around
                          your screen.
                        </p>
                        <button
                          className="primary"
                          onClick={() => setOpenChat(true)}
                        >
                          <MessageCircle size={17} />
                          Open Porti chat
                        </button>
                        <button
                          className="secondary"
                          onClick={() => go("Connections")}
                        >
                          AI connection settings
                        </button>
                      </div>
                    </section>
                  )}
                  {["Investigate token", "Track wallet", "Rug Guard"].includes(
                    view,
                  ) && (
                    <>
                      <section className="sc-panel sc-search-panel">
                        <form onSubmit={(e) => investigate(e)}>
                          <label htmlFor="near-investigate">
                            {view === "Track wallet"
                              ? "NEAR account"
                              : "NEAR token contract account"}
                          </label>
                          <div className="sc-address-input">
                            <Search size={19} />
                            <input
                              id="near-investigate"
                              placeholder={
                                view === "Track wallet"
                                  ? "alice.near"
                                  : "wrap.near"
                              }
                              value={account}
                              onChange={(e) =>
                                setAccount(e.target.value.trim())
                              }
                              required
                              spellCheck={false}
                            />
                            <button
                              type="submit"
                              className="primary"
                              onClick={(e) => {
                                e.preventDefault();
                                investigate();
                              }}
                              disabled={!!busy}
                            >
                              {busy === "investigate" ? (
                                <LoaderCircle size={15} className="spin" />
                              ) : (
                                <Search size={15} />
                              )}
                              Investigate
                            </button>
                          </div>
                          <small>
                            {view === "Track wallet"
                              ? "Use a NEAR mainnet account address."
                              : "Use a NEP-141 token contract on NEAR mainnet."}{" "}
                            EVM addresses and .testnet accounts are not accepted.
                          </small>
                        </form>
                        {view !== "Track wallet" && (
                          <div className="sc-quick-links">
                            <button
                              className="secondary"
                              onClick={() => setAccount("wrap.near")}
                            >
                              Use wrap.near
                            </button>
                            <button
                              className="secondary"
                              onClick={() => {
                                setSample(true);
                                setReport(demo.snapshot);
                              }}
                            >
                              Open sample risk report
                            </button>
                          </div>
                        )}
                      </section>
                      {view === "Rug Guard" && (
                        <section className="sc-panel">
                          <h2>Your token risk watch.</h2>
                          <p className="sc-section-note">
                            Holder concentration is a warning signal, not a
                            calibrated probability of a rug. The current NEAR
                            report does not establish liquidity, sellability or
                            privileged contract settings.
                          </p>
                          {tokens.length ? (
                            tokens.map((s) => (
                              <button
                                className="near-observation"
                                key={s.address}
                                onClick={() => openReport(s)}
                              >
                                <span>
                                  <strong>{s.metadata.symbol}</strong>
                                  <small>{s.address}</small>
                                </span>
                                <span
                                  className={`risk-small-badge ${tokenRisk(s).level}`}
                                >
                                  {tokenRisk(s).label}
                                </span>
                                <ArrowUpRight size={18} />
                              </button>
                            ))
                          ) : (
                            <div className="sc-empty">
                              <ShieldCheck size={30} />
                              <h3>Investigate before you follow.</h3>
                              <p>Your saved observations will appear here.</p>
                            </div>
                          )}
                        </section>
                      )}
                    </>
                  )}
                  {view === "Watchlist" && (
                    <section className="sc-panel">
                      <div className="sc-section-head">
                        <h2>Follow the useful trails.</h2>
                        <button
                          className="primary"
                          onClick={() => go("Investigate token")}
                        >
                          <Plus size={14} />
                          Add a token
                        </button>
                      </div>
                      <div className="sc-filters">
                        <input
                          aria-label="Search NEAR watchlist"
                          placeholder="Search account or label…"
                          value={search}
                          onChange={(e) => setSearch(e.target.value)}
                        />
                      </div>
                      {watches
                        .filter((w: any) =>
                          `${w.label} ${w.address}`
                            .toLowerCase()
                            .includes(search.toLowerCase()),
                        )
                        .map((w: any) => (
                          <article className="sc-watch-row" key={w.id}>
                            <span className="sc-avatar">
                              {w.kind === "token" ? (
                                <Coins size={18} />
                              ) : (
                                <Wallet size={18} />
                              )}
                            </span>
                            <div className="sc-watch-main">
                              <button
                                onClick={() => {
                                  const s = snapshots[`${w.kind}:${w.address}`];
                                  s
                                    ? openReport(s)
                                    : investigate(undefined, w.kind, w.address);
                                }}
                              >
                                <strong>{w.label}</strong>
                                <ArrowUpRight size={14} />
                              </button>
                              <small>
                                {w.address} ·{" "}
                                {w.paused
                                  ? "Paused"
                                  : when(
                                      snapshots[`${w.kind}:${w.address}`]
                                        ?.checkedAt,
                                    )}
                              </small>
                            </div>
                            <div className="sc-watch-actions">
                              <button
                                className="secondary"
                                aria-label={`Refresh ${w.address}`}
                                disabled={!!busy || w.paused || sample}
                                onClick={() =>
                                  investigate(undefined, w.kind, w.address)
                                }
                              >
                                <RefreshCw size={14} />
                              </button>
                              <button
                                className="icon-button"
                                aria-label={`${w.paused ? "Resume" : "Pause"} ${w.address}`}
                                disabled={sample || !!busy}
                                onClick={() =>
                                  act({ action: "pause-watch", id: w.id })
                                }
                              >
                                {w.paused ? (
                                  <Play size={15} />
                                ) : (
                                  <Pause size={15} />
                                )}
                              </button>
                              <button
                                className="icon-button"
                                aria-label={`Remove ${w.address}`}
                                disabled={sample || !!busy}
                                onClick={() =>
                                  act({ action: "unwatch", id: w.id })
                                }
                              >
                                <Trash2 size={15} />
                              </button>
                            </div>
                          </article>
                        ))}
                      {!watches.length && (
                        <div className="sc-empty">
                          <Eye size={30} />
                          <h3>A little quiet. For now.</h3>
                          <p>
                            Ask Porti to track a token or add one from an
                            investigation.
                          </p>
                          <button
                            className="secondary"
                            onClick={() => setOpenChat(true)}
                          >
                            Ask Porti to track something
                          </button>
                        </div>
                      )}
                      <p className="sc-fine">
                        Up to 25 watches. One due observation refreshes at a
                        time while this tab is visible; no closed-tab
                        monitoring.
                      </p>
                    </section>
                  )}
                  {view === "Profile" && !sample && <XConnect/>}
                  {view === "Profile" && (
                    <div className="sc-two-col">
                      <section className="sc-panel sc-form">
                        <span className="sc-eyebrow">YOUR PORTI IDENTITY</span>
                        <h2>
                          {profile
                            ? "@" + profile.username
                            : "A name people can send to."}
                        </h2>
                        <p>
                          Link a NEAR wallet to a unique username. A signed
                          message and a finalized full-access-key check
                          establish wallet control.
                        </p>
                        <div className="near-profile-wallet">
                          <Wallet size={21} />
                          <span>
                            {walletAccount || "No wallet connected"}
                            <small>
                              {walletAccount
                                ? "NEAR mainnet wallet selected"
                                : "Connection does not automatically link a profile"}
                            </small>
                          </span>
                          <button
                            className="secondary"
                            onClick={() => connect()}
                            disabled={!!busy || sample}
                          >
                            {walletAccount ? "Change" : "Connect wallet"}
                          </button>
                        </div>
                        <form onSubmit={linkProfile}>
                          <label htmlFor="profile-username">
                            Platform username
                          </label>
                          <div className="near-handle-input">
                            <span>@</span>
                            <input
                              id="profile-username"
                              required
                              value={profile?.username || username}
                              disabled={!!profile}
                              onChange={(e) =>
                                setUsername(
                                  e.target.value
                                    .replace(/^@/, "")
                                    .toLowerCase(),
                                )
                              }
                              placeholder="michael"
                              minLength={3}
                              maxLength={20}
                              pattern="[a-z][a-z0-9_]{2,19}"
                              autoComplete="off"
                            />
                          </div>
                          <small>
                            3–20 characters. Unique on this platform. Your
                            claimed name stays fixed in this release.
                          </small>
                          <label className="sc-check">
                            <input
                              type="checkbox"
                              checked={profileConsent}
                              onChange={(e) =>
                                setProfileConsent(e.target.checked)
                              }
                            />
                            <span>
                              I understand that @username → wallet will be
                              visible to platform users.
                              <small>
                                This is an offchain directory; it is not a NEAR
                                account name or a public identity certificate.
                              </small>
                            </span>
                          </label>
                          <button
                            className="primary"
                            disabled={
                              !!busy ||
                              !walletAccount ||
                              sample ||
                              !profileConsent
                            }
                            type="submit"
                          >
                            <ShieldCheck size={16} />
                            {profile
                              ? "Verify & relink wallet"
                              : "Sign & link my wallet"}
                          </button>
                        </form>
                        {profile && (
                          <div className="near-profile-linked">
                            <Check size={17} />
                            <div>
                              <strong>
                                @{profile.username} → {profile.wallet}
                              </strong>
                              <small>
                                Wallet ownership verified{" "}
                                {when(profile.verifiedAt)}
                              </small>
                            </div>
                            <button
                              className="sc-text-button"
                              onClick={() => act({ action: "unlink-profile" })}
                              disabled={!!busy || sample}
                            >
                              Unlink
                            </button>
                          </div>
                        )}
                        {wallet && (
                          <button
                            className="sc-text-button"
                            onClick={async () => {
                              await connector.current.disconnect(wallet);
                              setWallet(null);
                              setWalletAccount("");
                            }}
                          >
                            Disconnect selected wallet
                          </button>
                        )}
                      </section>
                      <section className="sc-panel sc-lilac">
                        <UserRound size={28} />
                        <h2>“Porti, send it to @michael.”</h2>
                        <p>
                          Porti looks up the verified wallet mapping, displays
                          both the handle and address, and pins that mapping to
                          your review. If the mapping changes before approval,
                          it asks you to prepare a fresh transfer.
                        </p>
                        <div className="near-profile-steps">
                          <span>
                            <b>01</b>Choose your unique username.
                          </span>
                          <span>
                            <b>02</b>Sign a wallet-ownership message.
                          </span>
                          <span>
                            <b>03</b>Receive transfers by username.
                          </span>
                        </div>
                        <p className="sc-fine">
                          Check the handle spelling and final wallet address. A
                          verified wallet link does not establish who a person
                          is.
                        </p>
                      </section>
                    </div>
                  )}
                  {view === "Transfers" && (
                    <>
                      <div className="sc-two-col">
                        <section className="sc-panel sc-form">
                          <span className="sc-eyebrow">BEFORE YOU SIGN</span>
                          <h2>Prepare a transfer.</h2>
                          <p>
                            Native NEAR or NEP-141 tokens, sent from your
                            selected wallet. Porti prepares details; your wallet
                            approves the transaction.
                          </p>
                          <form onSubmit={prepare}>
                            <label htmlFor="transfer-recipient">
                              Recipient · @username or NEAR account
                            </label>
                            <input
                              id="transfer-recipient"
                              placeholder="@michael or alice.near"
                              value={form.recipient}
                              onChange={(e) =>
                                setForm({
                                  ...form,
                                  recipient: e.target.value.trim(),
                                })
                              }
                              required
                            />
                            <label htmlFor="transfer-token">
                              Token contract · use near for native NEAR
                            </label>
                            <input
                              id="transfer-token"
                              value={form.token}
                              placeholder="near or wrap.near"
                              onChange={(e) =>
                                setForm({
                                  ...form,
                                  token: e.target.value.trim(),
                                })
                              }
                              required
                            />
                            <div className="sc-trade-fields">
                              <div>
                                <label htmlFor="transfer-amount">Amount</label>
                                <input
                                  id="transfer-amount"
                                  inputMode="decimal"
                                  value={form.amount}
                                  onChange={(e) =>
                                    setForm({ ...form, amount: e.target.value })
                                  }
                                  required
                                />
                              </div>
                              <div>
                                <label htmlFor="transfer-denomination">
                                  Denomination
                                </label>
                                <select
                                  id="transfer-denomination"
                                  value={form.denomination}
                                  onChange={(e) =>
                                    setForm({
                                      ...form,
                                      denomination: e.target.value,
                                    })
                                  }
                                >
                                  <option value="usd">USD worth</option>
                                  <option value="token">Token quantity</option>
                                </select>
                              </div>
                            </div>
                            <button
                              className="primary"
                              disabled={!!busy || sample || !walletAccount}
                              type="submit"
                            >
                              <ShieldCheck size={15} />
                              Prepare review
                            </button>
                            {!walletAccount && (
                              <button
                                type="button"
                                className="secondary"
                                onClick={() => connect()}
                                disabled={!!busy || sample}
                              >
                                Connect NEAR wallet
                              </button>
                            )}
                          </form>
                          <p className="sc-fine">
                            USD requests are capped at $100 and require a
                            reference price under five minutes old. Native
                            quantities are capped at 100 NEAR. Storage
                            registration may require a separate NEAR deposit,
                            shown before approval.
                          </p>
                        </section>
                        <section className="sc-panel sc-lilac">
                          <h2>Your reviewed actions.</h2>
                          {!sample && p.drafts.length ? (
                            p.drafts.slice(0, 8).map((d: any) => (
                              <button
                                className="near-transfer-row"
                                key={d.id}
                                onClick={() => openDraft(d)}
                              >
                                <Send size={18} />
                                <span>
                                  <strong>
                                    {d.amount} {d.symbol}
                                  </strong>
                                  <small>
                                    To{" "}
                                    {d.recipientUsername
                                      ? "@" + d.recipientUsername
                                      : d.recipient}
                                  </small>
                                </span>
                                <span className="sc-pill">
                                  {d.status === "finalized"
                                    ? "Finalized"
                                    : Date.now() > d.expiresAt
                                      ? "Expired"
                                      : "Needs review"}
                                </span>
                              </button>
                            ))
                          ) : (
                            <div className="sc-empty">
                              <Send size={30} />
                              <h3>No transfers prepared.</h3>
                              <p>
                                Ask Porti naturally, or use the form beside this
                                panel.
                              </p>
                            </div>
                          )}
                          <div className="sc-rule-note">
                            <Info size={18} />
                            <p>
                              The chat never signs or submits a transfer. A
                              returned transaction hash is not treated as
                              success until the final outcome matches the
                              reviewed sender, recipient, amount and actions.
                            </p>
                          </div>
                        </section>
                      </div>
                    </>
                  )}
                  {view === "Alerts" && (
                    <section className="sc-panel">
                      <div className="sc-section-head">
                        <h2>Your observation inbox.</h2>
                        <button
                          className="secondary"
                          disabled={!!busy || sample}
                          onClick={() => act({ action: "read-alerts" })}
                        >
                          <Check size={15} />
                          Mark all read
                        </button>
                      </div>
                      {alerts.length ? (
                        alerts.map((a: any) => (
                          <article
                            className={`sc-alert-row ${a.read ? "" : "unread"}`}
                            key={a.id}
                          >
                            <Bell size={19} />
                            <div>
                              <strong>{a.label}</strong>
                              <p>
                                {a.address} · {when(a.createdAt)}
                              </p>
                              <button
                                className="sc-text-button"
                                onClick={() => {
                                  const s = snapshots[`token:${a.address}`];
                                  if (s) openReport(s);
                                }}
                              >
                                Inspect evidence
                                <ArrowRight size={13} />
                              </button>
                            </div>
                          </article>
                        ))
                      ) : (
                        <div className="sc-empty">
                          <Bell size={30} />
                          <h3>No new observations.</h3>
                          <p>
                            Watch a token and refresh it to establish a
                            baseline.
                          </p>
                        </div>
                      )}
                    </section>
                  )}
                  {view === "Investigate token" && contextToken && !report && (
                    <TokenChart contract={contextToken} sample={sample} />
                  )}
                  {view === "Porti Apps" && <PortiApps sample={sample} onStake={()=>go("Stake NEAR")} />}
                  {view === "System status" && !sample && <SystemStatus />}
                  {view === "System status" && sample && (
                    <section className="sc-panel">
                      <h2>Switch to Live to inspect real system status.</h2>
                    </section>
                  )}
                  {view === "Markets" && <Markets sample={sample} onSwap={()=>go("Swap")} onInvestigate={c=>{go("Investigate token");setAccount(c);setContextToken(c);investigate(undefined,"token",c)}}/>}
                  {view === "Swap" && <Swaps wallet={wallet} account={walletAccount} sample={sample} onConnect={()=>connect("main")}/>}
                  {view === "Buy NEAR" && <section className="sc-panel"><BuyNear account={walletAccount} sample={sample} onConnect={()=>connect("main")}/></section>}
                  {view === "Stake NEAR" && <Staking wallet={wallet} account={walletAccount} sample={sample} onConnect={()=>connect("main")} />}
                  {view === "Wallets" && (
                    <WalletHub
                      onCreateInternal={()=>setWalletLocation("modal")}
                      walletError={error}
                      roles={p.walletRoles || {}}
                      account={walletAccount}
                      sample={sample}
                      busy={!!busy}
                      onConnect={(role) => connect(role)}
                      onUnlink={(role) =>
                        act({ action: "wallet-unlink", role })
                      }
                      onTransfer={() => go("Transfers")}
                      onFund={async (token, amount) => {
                        const main = p.walletRoles?.main?.account;
                        const agent = p.walletRoles?.agent?.account;
                        if (sample || !wallet || !main || !agent || walletAccount !== main) {
                          setError("Select your verified main wallet and link a separate agent wallet first.");
                          return;
                        }
                        const result = await act({
                          action: "prepare-transfer",
                          requestId: browserRequestId(),
                          sender: main,
                          recipient: agent,
                          token,
                          amount,
                          denomination: "token",
                          agentDeposit: true,
                        });
                        if (result?.draft) openDraft(result.draft);
                      }}
                    />
                  )}
                  {view === "Porti Care" && <Charity roles={p.walletRoles||{}} account={walletAccount} sample={sample} onConnect={()=>connect("main")} onDraft={openDraft}/>}
                  {view === "Friends" && <Friends sample={sample} />}
                  {view === "Telegram" && <TelegramSettings sample={sample} />}
                  {view === "Connections" && (
                    <>
                      <div className="sc-two-col">
                        <section className="sc-panel sc-form">
                          <span className="sc-eyebrow">01 · NEAR AI CLOUD</span>
                          <h2>Bring Porti to life.</h2>
                          <p>
                            The chat uses NEAR AI Cloud’s tool-calling API. Your
                            messages and requested research are sent there. The
                            key stays encrypted on the server.
                          </p>
                          <span
                            className={`near-connection-badge ${p.aiConfigured ? "ready" : ""}`}
                          >
                            {p.aiConfigured
                              ? "AI key configured"
                              : "AI is not connected yet"}
                          </span>
                          <div className="sc-rule-note">
                            <Sparkles size={18} aria-hidden="true" />
                            <div>
                              <strong>$10 in free NEAR AI credits</strong>
                              <p>
                                Claim the $10 offer on NEAR Builders if it is
                                available to your account. Then return here to
                                connect the API key they issue.
                              </p>
                              <div className="sc-source-links">
                                <a
                                  href="https://nearbuilders.org/dashboard"
                                  target="_blank"
                                  rel="noopener noreferrer"
                                >
                                  Claim $10 in credits on NEAR Builders
                                  <ExternalLink size={13} />
                                </a>
                              </div>
                            </div>
                          </div>
                          <p>
                            In NEAR AI Cloud, open Credits to add usage
                            credits, then open API Keys to create a key.
                            Return here to connect it. NEAR AI handles billing
                            in its own dashboard.
                          </p>
                          <div className="sc-source-links">
                            <a
                              href="https://cloud.near.ai"
                              target="_blank"
                              rel="noreferrer"
                            >
                              Get an API key or add credits
                              <ExternalLink size={13} />
                            </a>
                          </div>
                          <form
                            onSubmit={async (e) => {
                              e.preventDefault();
                              const d = await act({
                                action: "save-ai",
                                key: connection.key,
                                model: connection.model,
                              });
                              if (d) setConnection({ ...connection, key: "" });
                            }}
                          >
                            <label htmlFor="near-ai-key">
                              NEAR AI Cloud API key
                            </label>
                            <input
                              id="near-ai-key"
                              type="password"
                              autoComplete="off"
                              value={connection.key}
                              onChange={(e) =>
                                setConnection({
                                  ...connection,
                                  key: e.target.value,
                                })
                              }
                              placeholder="Your NEAR AI Cloud key"
                              required
                            />
                            <label htmlFor="near-ai-model">
                              Tool-capable model ID
                            </label>
                            <input
                              id="near-ai-model"
                              value={connection.model}
                              onChange={(e) =>
                                setConnection({
                                  ...connection,
                                  model: e.target.value,
                                })
                              }
                              required
                            />
                            <small>
                              Verifying sends a small “Reply OK” request using
                              your provider credits. No purchase is made here.
                            </small>
                            <button
                              className="primary"
                              disabled={!!busy || sample}
                              type="submit"
                            >
                              <Sparkles size={15} />
                              Verify & connect AI
                            </button>
                          </form>
                          <div className="sc-source-links">
                            {p.aiConfigured && (
                              <button
                                disabled={!!busy}
                                onClick={() => act({ action: "remove-ai" })}
                              >
                                Remove saved AI key
                              </button>
                            )}
                          </div>
                        </section>
                        <section className="sc-panel sc-form">
                          <span className="sc-eyebrow">
                            02 · FINALIZED NEAR READS
                          </span>
                          <h2>A reliable route to NEAR.</h2>
                          <p>
                            Uses the official public RPC by default. Add a
                            mainnet FastNEAR or QuickNode endpoint if public
                            access is limited.
                          </p>
                          <span
                            className={`near-connection-badge ${p.rpcConfigured ? "ready" : ""}`}
                          >
                            {p.rpcConfigured
                              ? "Private RPC configured"
                              : "Official public RPC fallback"}
                          </span>
                          <form
                            onSubmit={async (e) => {
                              e.preventDefault();
                              const d = await act({
                                action: "save-rpc",
                                url: connection.rpc,
                              });
                              if (d) setConnection({ ...connection, rpc: "" });
                            }}
                          >
                            <label htmlFor="near-rpc">
                              HTTPS NEAR mainnet RPC
                            </label>
                            <input
                              id="near-rpc"
                              type="password"
                              autoComplete="off"
                              value={connection.rpc}
                              onChange={(e) =>
                                setConnection({
                                  ...connection,
                                  rpc: e.target.value,
                                })
                              }
                              placeholder="https://rpc.mainnet.near.org"
                            />
                            <div className="sc-buttons">
                              <button
                                className="primary"
                                disabled={!!busy || sample || !connection.rpc}
                                type="submit"
                              >
                                Verify & save RPC
                              </button>
                              <button
                                type="button"
                                className="secondary"
                                disabled={!!busy || sample}
                                onClick={() => act({ action: "check-rpc" })}
                              >
                                Check connection
                              </button>
                            </div>
                          </form>
                        </section>
                      </div>
                      <section className="sc-panel sc-form">
                        <span className="sc-eyebrow">
                          03 · TOP-HOLDER CANDIDATES
                        </span>
                        <h2>NearBlocks data access.</h2>
                        <p>
                          The holder map uses indexer candidate accounts, then
                          checks up to ten balances and account types against
                          finalized NEAR RPC. Missing data stays missing.
                        </p>
                        <form
                          className="near-index-form"
                          onSubmit={async (e) => {
                            e.preventDefault();
                            const d = await act({
                              action: "save-index",
                              key: connection.index,
                            });
                            if (d) setConnection({ ...connection, index: "" });
                          }}
                        >
                          <label htmlFor="nearblocks-key">
                            NearBlocks API key
                          </label>
                          <input
                            id="nearblocks-key"
                            type="password"
                            autoComplete="off"
                            value={connection.index}
                            onChange={(e) =>
                              setConnection({
                                ...connection,
                                index: e.target.value,
                              })
                            }
                            placeholder="Your NearBlocks API key"
                          />
                          <button
                            className="primary"
                            disabled={!!busy || sample || !connection.index}
                            type="submit"
                          >
                            Verify & save indexer key
                          </button>
                        </form>
                        <div className="sc-source-links">
                          <a
                            href="https://nearblocks.io/apis"
                            target="_blank"
                            rel="noreferrer"
                          >
                            NearBlocks API access
                            <ExternalLink size={13} />
                          </a>
                          {p.indexConfigured && (
                            <button
                              disabled={!!busy}
                              onClick={() => act({ action: "remove-index" })}
                            >
                              Remove saved indexer key
                            </button>
                          )}
                        </div>
                      </section>
                    </>
                  )}
                </>
              )}
            </>
          )}
          <footer className="sc-footer">
            <span>PORTI · Your NEAR companion · Independent project</span>
            <a href="https://nearblocks.io" target="_blank" rel="noreferrer">
              Onchain data attribution: NearBlocks
            </a>
          </footer>
        </main>
      </div>
      <PortiCompanion
        swapPanel={<Swaps wallet={wallet} account={walletAccount} sample={sample} onConnect={()=>connect("main")} inline />}
        showHint={view === "Overview" || view === "Ask Porti"}
        open={openChat && walletLocation !== "modal"}
        setOpen={setOpenChat}
        walletInChat={walletLocation === "chat" && !sample}
        onWalletSetup={() => setWalletLocation("chat")}
        walletPanel={
          <EmbeddedWalletHost
            open={walletLocation === "modal" || (walletLocation === "chat" && openChat && !sample)}
            inline={walletLocation === "chat"}
            onClose={() => setWalletLocation(null)}
            onWalletOptions={() => {
              setWalletLocation(null);
              setOpenChat(false);
              go("Wallets");
            }}
            onUse={useEmbeddedWallet}
            onRequestOpen={() => {
              if (walletLocation === "chat" && !sample) setOpenChat(true);
              else setWalletLocation("modal");
            }}
            onDisconnected={() => {
              if (["porti-embedded", "porti-local"].includes(wallet?.kind)) {
                setWallet(null);
                setWalletAccount("");
              }
            }}
          />
        }
        messages={sample ? [] : p.messages}
        onSend={sendChat}
        walletAccount={walletAccount}
        busy={!!busy}
        ready={!!p.aiConfigured}
        sample={sample}
        onSettings={() => {
          setOpenChat(false);
          go("Connections");
        }}
        onWallets={() => {
          setOpenChat(false);
          go("Wallets");
        }}
        onNavigate={screen=>{if(["Swap","Stake NEAR","Buy NEAR","Markets","Transfers"].includes(screen)){setOpenChat(false);go(screen)}}}
        onReport={openReport}
        onTransfer={openDraft}
        contextToken={contextToken}
        setContextToken={setContextToken}
        error={error}
      />
      {report && (
        <div
          className="sc-overlay"
          onClick={(e) => {
            if (e.target === e.currentTarget) setReport(null);
          }}
        >
          <section
            className="sc-report"
            ref={modalRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="near-report-title"
          >
            <div className="sc-report-top">
              <span className="sc-eyebrow">
                {sample
                  ? "FICTIONAL WALKTHROUGH"
                  : "NEAR MAINNET · FIELD NOTES"}
              </span>
              <button
                className="icon-button"
                aria-label="Close investigation"
                onClick={() => setReport(null)}
              >
                <X size={20} />
              </button>
            </div>
            <h2 id="near-report-title">
              {report.kind === "token"
                ? "$" + report.metadata.symbol
                : report.address}
            </h2>
            <p className="near-report-account">{report.address}</p>
            <p className="sc-report-meta">
              {report.source} · {when(report.checkedAt)}
            </p>
            <div className="sc-buttons">
              <button
                className="primary"
                disabled={!!busy || sample}
                onClick={() =>
                  watch(
                    report.kind,
                    report.address,
                    report.metadata.symbol || report.address,
                  )
                }
              >
                <Plus size={14} />
                Track {report.kind}
              </button>
              {!sample && (
                <a
                  className="secondary"
                  href={`https://nearblocks.io/address/${report.address}`}
                  target="_blank"
                  rel="noreferrer"
                >
                  Open on NearBlocks
                  <ArrowUpRight size={14} />
                </a>
              )}
              {report.kind === "token" && !sample && (
                <button
                  className="secondary"
                  onClick={() => {
                    setContextToken(report.address);
                    setReport(null);
                    setOpenChat(true);
                  }}
                >
                  <Sparkles size={14} />
                  Ask Porti about this
                </button>
              )}
            </div>
            {message && (
              <p className="sc-report-feedback" role="status">
                {message}
              </p>
            )}
            {error && (
              <p className="sc-report-feedback error" role="alert">
                {error}
              </p>
            )}
            {report.kind === "token" && (
              <TokenChart contract={report.address} sample={sample} />
            )}
            {report.kind === "token" ? (
              <TokenRiskPanel
                snapshot={report}
                sample={sample}
                onInvestigate={(a) => {
                  setReport(null);
                  go("Track wallet");
                  setAccount(a);
                }}
                onWatchWallet={(a, label) => watch("wallet", a, label)}
              />
            ) : (
              <div className="near-account-stats">
                <div>
                  <span>Native NEAR balance</span>
                  <strong>
                    {decimal(report.metadata.coin_balance, 24)} NEAR
                  </strong>
                </div>
                <div>
                  <span>Account type</span>
                  <strong>
                    {report.metadata.is_contract
                      ? "Contract account"
                      : "No deployed code"}
                  </strong>
                </div>
                <div>
                  <span>Storage usage</span>
                  <strong>{report.metadata.storage_usage} bytes</strong>
                </div>
              </div>
            )}
            <div className="sc-report-limit">
              <Info size={18} />
              <div>
                <strong>Coverage & unresolved checks</strong>
                <p>{report.coverage}</p>
                {report.warnings.map((w: string) => (
                  <p key={w}>{w}</p>
                ))}
              </div>
            </div>
          </section>
        </div>
      )}
      {draft && (
        <div className="sc-overlay">
          <section
            className="sc-report near-transfer-review"
            ref={modalRef}
            role="dialog"
            aria-modal="true"
            aria-labelledby="transfer-review-title"
          >
            <div className="sc-report-top">
              <span className="sc-eyebrow">NEAR MAINNET · BEFORE YOU SIGN</span>
              <button
                className="icon-button"
                aria-label="Close transfer review"
                disabled={!!busy}
                onClick={() => setDraft(null)}
              >
                <X size={20} />
              </button>
            </div>
            <h2 id="transfer-review-title">{draft.agentDeposit ? "Review your agent wallet deposit." : "Review this transfer."}</h2>
            <div className="near-transfer-amount">
              <Send size={25} />
              <strong>
                {draft.amount}
                <small>{draft.symbol}</small>
              </strong>
            </div>
            <div className="near-review-lines">
              <div>
                <span>From wallet</span>
                <code>{draft.sender}</code>
              </div>
              {draft.recipientUsername && (
                <div>
                  <span>Recipient username</span>
                  <strong>@{draft.recipientUsername}</strong>
                </div>
              )}
              <div>
                <span>{draft.agentDeposit ? "To agent wallet" : "Resolved recipient wallet"}</span>
                <code>{draft.recipient}</code>
              </div>
              <div>
                <span>Token contract</span>
                <code>
                  {draft.token === "near" ? "Native NEAR" : draft.token}
                </code>
              </div>
              {draft.denomination === "usd" && (
                <div>
                  <span>Requested USD reference</span>
                  <strong>
                    Approximately ${draft.requestedAmount} at preparation
                  </strong>
                </div>
              )}
              <div>
                <span>Reference price</span>
                <strong>
                  {draft.price
                    ? `$${draft.price.usd} · ${draft.price.source}`
                    : "Token quantity · no USD valuation"}
                </strong>
              </div>
              {draft.gasReserve && (
                <div>
                  <span>Gas balance reserved (estimate)</span>
                  <strong>{decimal(draft.gasReserve, 24)} NEAR</strong>
                </div>
              )}
              <div>
                <span>Recipient storage deposit</span>
                <strong>{decimal(draft.storageDeposit, 24)} NEAR</strong>
              </div>
              <div>
                <span>Transaction status</span>
                <strong>
                  {draft.status === "finalized"
                    ? "Finalized and verified"
                    : draft.status === "submitted"
                      ? "Submitted · final verification pending"
                      : draft.status === "wallet_requested"
                        ? "Wallet outcome unknown · do not resubmit"
                        : expired
                          ? "Review expired"
                          : "Not submitted"}
                </strong>
              </div>
            </div>
            {error && (
              <div className="sc-notice error" role="alert">
                <Info size={17} />
                <span>{error}</span>
              </div>
            )}
            {message && (
              <div className="sc-notice" role="status">
                <Check size={17} />
                <span>{message}</span>
              </div>
            )}
            {draft.status === "finalized" ? (
              <a
                className="primary"
                href={`https://nearblocks.io/txns/${draft.hash}`}
                target="_blank"
                rel="noreferrer"
              >
                View finalized transaction
                <ExternalLink size={15} />
              </a>
            ) : (
              <>
                <label className="sc-check">
                  <input
                    type="checkbox"
                    checked={reviewed}
                    onChange={(e) => setReviewed(e.target.checked)}
                    disabled={
                      !!busy || expired || draft.status !== "awaiting_review"
                    }
                  />
                  <span>
                    I reviewed the exact amount, token and resolved recipient
                    wallet.
                    <small>
                      NEAR gas and the displayed storage deposit are additional
                      costs. USD value may change while wallet approval is
                      pending. A username wallet link can change; Porti checks
                      it again before opening the wallet.
                    </small>
                  </span>
                </label>
                <button
                  className="primary"
                  onClick={signTransfer}
                  disabled={
                    !!busy ||
                    !reviewed ||
                    expired ||
                    draft.status !== "awaiting_review" ||
                    !wallet ||
                    walletAccount !== draft.sender
                  }
                >
                  <Wallet size={16} />
                  {busy === "wallet-approval"
                    ? "Waiting for wallet…"
                    : "Approve in my NEAR wallet"}
                </button>
                {(!wallet || walletAccount !== draft.sender) && (
                  <button
                    className="secondary"
                    disabled={!!busy}
                    onClick={() => connect()}
                  >
                    Connect reviewed sender wallet
                  </button>
                )}
                {expired && (
                  <p className="sc-fine">
                    Prepare a fresh transfer to refresh the price and recipient
                    mapping. You can still verify an already-submitted
                    transaction below.
                  </p>
                )}
                <div className="near-reconcile">
                  <label htmlFor="transfer-hash">
                    Already submitted? Verify its NEAR transaction hash.
                  </label>
                  <input
                    id="transfer-hash"
                    value={receiptHash}
                    onChange={(e) => setReceiptHash(e.target.value.trim())}
                    placeholder="Transaction hash"
                  />
                  <button
                    className="secondary"
                    disabled={!!busy || !receiptHash}
                    onClick={verifyHash}
                  >
                    Verify final outcome
                  </button>
                </div>
              </>
            )}
          </section>
        </div>
      )}
    </div>
  );
}

