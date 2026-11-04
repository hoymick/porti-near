> Historical v0.6 notes. For current implementation and activation, see release-v08.md.

# Porti for NEAR v0.6

Porti is a NEAR mainnet companion. This specification describes the core NEAR product; Telegram development remains in progress as documented in CHECKPOINT.md.

## Delivered interfaces

- Original anime Porti launcher: pointer-draggable, viewport-bounded, keyboard-movable, position remembered on the device, reduced-motion support. Opens a tool-enabled chat panel with contextual token selection.
- Real NEAR AI Cloud Chat Completions integration (`https://cloud-api.near.ai/v1/chat/completions`), model configurable, default `zai-org/GLM-5.1-FP8` from current official quickstart. No OpenAI Platform key is required. No invented fallback replies. Missing provider access is an explicit connection state.
- Owner-scoped chat history, at most two model requests and two tools per turn, persisted results, replay ID handling and turn locking. Tools are allowlisted, bounded and cannot sign or broadcast. Public metadata is untrusted; failures and coverage must be disclosed. Tool mutations require matching explicit user intent. Actual transfer success comes only from verified receipts.
- NEAR account queries and NEP-141 metadata/supply/balance views use final RPC reads. NearBlocks v3 holder candidates are re-read at finality; failed raw balance reads are excluded. This is a sampled candidate list, not a proven complete holder ranking. Live transfer relationships, liquidity, sell simulation and admin permissions remain unimplemented/unknown.
- Token investigations, partial Rug Guard, maps, watchlists, limited in-app high-concentration observations, and explicit fictional walkthrough. No background/closed-tab monitoring.
- Transfer preparation for native NEAR and NEP-141 FTs. USD valuation requires a ≤5 minute, sufficiently confident DefiLlama reference; no stablecoin peg assumption. USD requests cap at $100. Native quantities cap at 100 NEAR. Decimal/integer calculations round USD-sized token amounts down. Self-transfers, EVM/testnet recipients and invalid precision are rejected.
- FT registration bounds read onchain; registration deposit capped at 0.1 NEAR; actual ft_transfer attaches one yoctoNEAR. Sender balances preserve storage cost and a 0.002 NEAR gas reserve. No seed or private key is requested or stored.
- Immutable owner-scoped transfer review records expire (60 seconds for USD-valued, 180 seconds for token quantity). Before signing, balance, price movement and username mapping are rechecked. The user explicitly reviews details and triggers their NEAR wallet. Returned hashes are reconciled against final transaction signer, receiver and exact actions/arguments plus execution outcomes before finalization is claimed. Redirect recovery preserves a draft ID only and never auto-resubmits.

## Profile / username transfers

D1 `profiles` directory has unique username, authenticated owner ID and wallet columns. Usernames are normalized lowercase, 3–20 ASCII characters with reserved names, no punctuation/Unicode lookalikes. One profile per owner and one wallet per profile. Names stay fixed for the current release; the wallet can be relinked after a fresh proof.

Linking uses a five-minute, one-use, owner/account/username/domain-bound NEP-413 challenge with random 32-byte nonce. Ed25519 signatures are verified over the tagged Borsh SHA-256 digest. The signing public key must be a current FullAccess key on the claimed mainnet account, read at finality. Proofs are consumed; only successful checks write the directory. Wallet-control verification does not prove real-world identity.

Transfers to @username resolve on the server. The resolved wallet and mapping version are pinned to the draft. A changed/removed mapping before signing invalidates the draft instead of redirecting funds. The review always shows both handle and exact account. Lookup is restricted to authenticated platform users; the Site audience remains private.

## Connections and secrets

NEAR AI Cloud, optional NearBlocks key and optional NEAR RPC are configured through server-verified forms. Keys and credential-bearing RPC URLs are AES-GCM encrypted at rest with per-owner additional authenticated data and are never returned to the client. Settings encryption derives its key from PORTI_SETTINGS_KEY with a Porti-specific domain. Existing encrypted credentials from a different scheme require migration or re-entry. RPC URLs are restricted to documented NEAR/FastNEAR/QuickNode providers and checked for mainnet. Keys are not stored in browser storage, code or Git.

No NEAR AI API key is configured yet. The UI explains how to connect through the provider dashboard. The verify action sends a bounded small request with user-supplied credentials, visibly explaining usage of provider credits. No credits or account subscriptions were purchased. No user wallet was connected, linked or used to transfer funds by Codex.

## Validation and limits

Pure tests cover account validation, exact integer conversions, USD rounding/caps, native/FT action construction, malicious receipt mismatch, NEP-413 message/domain/nonce/account tampering and NEAR holder maps. NEAR-only risk, notification policy and storage tests accompany the core checks. The profile migration was applied to an in-memory SQLite database and username/owner/wallet uniqueness checked. TypeScript and production build are required before publication.

A live provider inference run and funded wallet acceptance run cannot be completed without the user's NEAR AI connection and wallet approval. Public external APIs were inaccessible from development probes. No live success is claimed from fixtures.

## References

https://docs.near.ai/cloud/quickstart
https://docs.near.ai/cloud/guides/openai-compatibility
https://docs.near.ai/cloud/models
https://docs.near.org/web3-apps/tutorials/wallet-login
https://docs.near.org/api/rpc/contracts
https://docs.near.org/primitives/ft/standard
https://api.nearblocks.io/api-docs/index.html.md
https://docs.rs/near-api/latest/src/near_api/signer/mod.rs.html
https://github.com/DefiLlama/api-docs/blob/main/llms-free.txt
