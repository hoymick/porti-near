"use client";
import React, { useEffect, useState } from "react";
export default function SystemStatus() {
  const [data, setData] = useState<any>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  async function read(probe = false) {
    setBusy(true);
    setError("");
    try {
      const r = await fetch("/api/porti/health", {
          method: probe ? "POST" : "GET",
          headers: probe ? { "Content-Type": "application/json" } : undefined,
          body: probe ? "{}" : undefined,
          cache: "no-store",
        }),
        d: any = await r.json();
      if (!r.ok)
        throw new Error(
          (d.error?.message || "Status unavailable.") +
            (d.error?.requestId ? " Reference: " + d.error.requestId : ""),
        );
      setData(d);
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }
  useEffect(() => {
    read();
  }, []);
  const e = data?.evidence;
  return (
    <>
      <section className="sc-panel">
        <span className="sc-eyebrow">OPERATIONS · PORTI V0.13</span>
        <h2>Evidence before launch.</h2>
        <p>
          Hardening is installed. Real account acceptance and an independent
          recovery/security review still determine launch readiness.
        </p>
        <div className="sc-buttons">
          <button
            className="primary"
            disabled={busy}
            onClick={() => read(true)}
          >
            {busy ? "Checking…" : "Check database & mainnet RPC"}
          </button>
          <button className="secondary" disabled={busy} onClick={() => read()}>
            Refresh status
          </button>
        </div>
        {error && <p role="alert">{error}</p>}
        {data && (
          <>
            <div className="porti-metrics">
              {[
                ["Internal wallet service", data.providers.embeddedWalletConfigured ? "Configured · owner acceptance required" : "Owner service setup required"],
                ["Private image storage", data.providers.imagesConfigured ? "Configured" : "Setup required"],
                ["X OAuth", data.providers.xConfigured ? "Configured · test linking" : "Owner credentials required"],
                ["MoonPay checkout", data.providers.moonpayConfigured ? "Configured · test checkout" : "Owner setup required"],
                ["NEAR Intents key", data.providers.intentsKeyConfigured ? "Configured · check route" : "Optional key not configured"],
                ["Database", data.database.ok ? "Connected" : "Unavailable"],
                [
                  "Mainnet RPC",
                  data.rpc
                    ? data.rpc.ok
                      ? `Verified · ${data.rpc.latencyMs} ms`
                      : "Check failed"
                    : "Run a live check",
                ],
                [
                  "NEAR AI key",
                  data.providers.aiConfigured ? "Configured" : "Setup required",
                ],
                [
                  "Holder indexer key",
                  data.providers.indexerConfigured
                    ? "Configured"
                    : "Setup required",
                ],
              ].map(([k, v]) => (
                <div key={k}>
                  <small>{k}</small>
                  <strong>{v}</strong>
                </div>
              ))}
            </div>
            <p className="sc-fine">
              A configured key is not proof of a successful transaction or model
              response. Checks perform reads, and do not spend funds or call the
              AI model.
            </p>
          </>
        )}
      </section>
      {data && (
        <>
          <section className="sc-panel">
            <h2>Observed acceptance evidence.</h2>
            <div className="porti-metrics">
              {[
                [
                  "Wallet ownership proof",
                  e.walletProof ? "Verified" : "Not observed",
                ],
                [
                  "NEAR AI inference",
                  e.inferenceAt
                    ? new Date(e.inferenceAt).toLocaleString()
                    : "Not observed",
                ],
                ["Finalized transfer receipts", String(e.verifiedTransfers)],
                [
                  "Telegram delivery",
                  e.telegramDeliveryAt
                    ? new Date(e.telegramDeliveryAt).toLocaleString()
                    : "Not observed",
                ],
                [
                  "Background checks",
                  data.telegram.schedule?.enabled
                    ? `Every ${data.telegram.schedule.intervalMinutes} minutes`
                    : "Not enabled",
                ],
              ].map(([k, v]) => (
                <div key={k}>
                  <small>{k}</small>
                  <strong>{v}</strong>
                </div>
              ))}
            </div>
            {data.telegram.lastError && (
              <p role="status">{data.telegram.lastError}</p>
            )}
          </section>
          <section className="sc-panel">
            <h2>Limits & privacy.</h2>
            <p>
              AI chat: {data.limits.chatPerMinute} turns per minute,{" "}
              {data.limits.chatPerDay} per day. Research:{" "}
              {data.limits.researchPerMinute} requests per minute. API limits
              persist across server restarts.
            </p>
            <p>
              Friend-message history is visible for{" "}
              {data.retention.friendMessagesDays} days. Telegram records expire
              after {data.retention.telegramDays} days. Background maintenance
              removes expired records in batches. Chat is server-stored, without
              end-to-end encryption.
            </p>
            <p>
              Every transfer requires your wallet approval. A final receipt
              requires matching onchain execution evidence, and token transfers
              also require the contract’s matching NEP-141 event. A successful
              contract call alone does not prove token delivery.
            </p>
          </section>
          <section className="sc-panel">
            <h2>Before a public launch.</h2>
            <p>
              Dependency scan: {data.dependencyAudit.critical} critical,{" "}
              {data.dependencyAudit.high} high, {data.dependencyAudit.moderate}{" "}
              moderate findings. The remaining moderate findings are in lint
              tooling and still need review. This scan is not an independent
              security audit.
            </p>
            <ul>
              {data.remaining.map((s: string) => (
                <li key={s}>{s}</li>
              ))}
            </ul>
          </section>
        </>
      )}
    </>
  );
}
