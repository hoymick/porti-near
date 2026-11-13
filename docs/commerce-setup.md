# Porti provider activation

Reviewed 13 November 2026. The owner supplies credentials in the hosting environment. Do not paste secrets in chat, source, URLs, screenshots or issue reports. Configuration presence is not live acceptance evidence. The standalone Worker uses public landing/demo plus NEAR-wallet sessions; the original Sites deployment remains owner-private. See [current setup](setup.md) for both boundaries.

## Required host services

- D1 binding `DB`, with ordered `drizzle/` migrations applied.
- Optional private R2 binding `BUCKET`, required for pictures/evidence. On standalone, generate it with build variable `PORTI_R2_BUCKET`; `.openai/hosting.json` describes the original Sites target. Do not enable public bucket access.
- Authenticated identity from the selected host mode: NEAR-wallet sessions on standalone, optional Cloudflare Access, or original Sites identity. Private Site service access is reserved for that Site’s Telegram updater; never impersonate visitors.
- `PORTI_SETTINGS_KEY`: stable high-entropy encryption secret; preserve existing data compatibility.
- `PORTI_APP_URL`: the actual HTTPS Site origin, without a trailing slash.

## Provider configuration

| Setting | Purpose / activation condition |
| --- | --- |
| `NEAR_AI_API_KEY` | Optional shared NEAR AI Cloud credential; the existing encrypted per-user Connections key is also supported. |
| `NEARBLOCKS_API_KEY` | Optional indexer key. A valid key may not resolve provider access restrictions; verify actual reads. |
| `NEAR_RPC_URL` | Optional supported mainnet JSON-RPC override. |
| `NEAR_INTENTS_API_KEY` | Optional 1Click server-side bearer key. Provider access and returned routes must work before a swap can proceed. Keys may change provider fees/limits. |
| `X_CLIENT_ID` | OAuth 2 client ID for the owner's X developer application. |
| `X_CLIENT_SECRET` | OAuth 2 confidential-client secret; server only. |
| `MOONPAY_PUBLIC_KEY` | Live merchant publishable key. |
| `MOONPAY_SECRET_KEY` | Matching server signing secret. |
| `PORTI_MOONPAY_IP_HEADER` | Name of a verified, host-controlled header carrying the actual checkout user's IP. Never trust a client-set header. |
| `PORTI_MOONPAY_LIVE_ENABLED` | Set to `true` only after merchant approval, NEAR currency/network support and trusted IP forwarding have been verified. |

Existing Telegram bot setup remains in its dedicated password form and [operations guide](operations.md).

## X activation

Register this exact redirect URI in the X application:

`https://porti-near.hoymick240.workers.dev/api/porti/x/callback`

Use the actual app origin if deploying elsewhere; each host has its own exact redirect URI.

Enable OAuth 2 Authorization Code with PKCE for a confidential web client. Porti requests `users.read tweet.read`; it requests no posting, direct-message or offline scope. Open Profile → Connect X account and complete authorization yourself. Successful linking displays the returned handle. Test wrong-state, expired and reused callbacks without disclosing their query values in logs.

Porti stores the profile ID, handle, display name and linking time. It attempts to revoke the temporary access token immediately after linking and does not persist it. Unlink removes the local profile; the user can also revoke access in X settings. Linking is proof of account control, not identity verification.

## MoonPay activation

Use an approved live merchant application configured for NEAR on NEAR mainnet. Validate the signing and `allowedIpAddress` HMAC requirements against current MoonPay documentation. Both HMACs use the secret server-side. The payment URL is restricted to `https://buy.moonpay.com/`.

Have the host confirm how the genuine end-user IP is forwarded. A proxy egress IP or a freely supplied browser header is not a substitute. If that cannot be established, leave live checkout disabled; the UI links to MoonPay's official website for manual selection.

Only then set `PORTI_MOONPAY_LIVE_ENABLED=true`. Test a signed checkout using the merchant's supported testing procedure. Card/Apple Pay visibility depends on device, geography, currency support, eligibility and provider verification. The budget range is $20–$10,000, subject to stricter provider limits. Porti neither collects card data nor treats an opened/returned checkout as payment confirmation. No webhook-based purchase receipt is implemented.

## NEAR Intents activation

Confirm server access to `GET https://1click.chaindefuser.com/v0/tokens`, then request a small **dry preview** from Wallet → Swap. Do not fabricate catalog entries or bypass provider access restrictions. The development executor previously received HTTP 403. The hosted worker may have a different result; test it and report it honestly.

Use only the selected catalog asset's exact ID, decimals and network. Native NEAR source is wrapped to wNEAR; cross-chain origins and arbitrary smart-contract calls are not supported. The connected NEAR signer must have a current wallet-control proof. For NEAR output, register the token in a separately approved wallet transaction when required.

Live financial acceptance is performed by the wallet owner: start with a small amount, inspect both reviews, approve only the expected `wrap.near` transaction, and verify destination output or refund. Never re-deposit just because a wallet redirected or a status lookup failed.

## Images and retention

Uploads are JPEG/PNG after browser resizing, max 500 KB and 4096×4096 server bounds. Source EXIF is removed by the normal canvas upload path. AI attachments are owner-only; friend images require current accepted membership and no block. Images are served through authenticated routes with private/no-store headers, not public object URLs. Friend messages and images are not end-to-end encrypted.

Image access expires after 90 days. **Configure an R2 lifecycle rule for the `porti/` prefix to delete objects after 90 days.** Until that rule is configured, expired objects may remain stored even though Porti refuses reads. This also covers uploads abandoned before sending. Sending an AI image transmits it to NEAR AI Cloud's vision model; do not upload secrets or payment credentials.

## Owner acceptance checklist

- System status shows each service's setup state without revealing its key.
- X connects to the expected account; unlink removes it.
- Buy NEAR offers the expected method on the provider and the exact reviewed NEAR address; no completion claim appears from a return alone.
- Private image loads after refresh; a foreign workspace and a blocked former friend cannot read it.
- Same-chain and cross-chain dry quotes match sender, asset, amount, recipient and refund wallet.
- Owner-approved funded stake/swap/transfer tests have exact transaction evidence recorded separately; automated mocks do not count as live settlement.
- Recovery and security review complete before any broader launch.

Primary references: [MoonPay parameters](https://dev.moonpay.com/widget/on-ramp/customization/parameters), [X OAuth PKCE](https://docs.x.com/fundamentals/authentication/oauth-2-0/authorization-code), [NEAR Intents 1Click](https://docs.near-intents.org/integration/distribution-channels/1click-api/about-1click-api), [NEAR reference integrations](https://github.com/near/agent-skills/tree/main/skills/near-intents).

## Internal agent-wallet activation

The default device-wallet option generates and encrypts a key locally without a paid provider. The optional managed Seams option needs a compatible wallet service, registration Gateway and mainnet sponsor. See [internal wallet setup](internal-wallet.md) for the exact fields and acceptance checks. Neither option uses the AI key as a wallet credential.
