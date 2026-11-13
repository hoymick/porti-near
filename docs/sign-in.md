# Sign in with a NEAR wallet

The landing page offers two ways in:

- **Try demo:** sample data, no sign-in, no wallet, no funds. The Phone pocket simulator works in the demo.
- **Sign in with NEAR wallet:** the wallet list (NEAR Connector) opens. The user picks a wallet and signs a one-time message. That signature is a NEP-413 message, not a transaction, so it costs no gas and sends no funds. The server then opens a session for that account and the full dashboard loads. **Sign out** sits in the top bar.

## How the server decides who you are

1. `POST /api/auth {action:"challenge", account}` creates a one-time message bound to the account and this site's host. It expires after 5 minutes.
2. The wallet signs it. `POST /api/auth {action:"verify", challengeId, proof}` then checks four things:
   - the signature matches the exact message, nonce and site;
   - the signing key is a **current full-access key** of that account on NEAR mainnet;
   - the challenge hasn't been used before (it is single use);
   - the account in the proof matches the account in the challenge.
3. If all four pass, the server sets an `HttpOnly; SameSite=Lax` cookie (`Secure` on https) holding a random 256-bit token. Only its SHA-256 hash is stored, in `porti_sessions`. Sessions last 7 days.
4. On every request, the Worker strips any `oai-*`, `x-porti-*` and Access headers a client sent. It sets the identity (`near:<account>`) only from a valid session. `POST /api/auth {action:"logout"}` deletes the session.

Challenge and verify requests are rate-limited per IP and must come from the same origin.

## Modes

`PORTI_AUTH_MODE` selects how identity is resolved:

| Value | Identity source | Default when |
| --- | --- | --- |
| `near` | NEAR wallet sessions (this page) | the Cloudflare standalone host and local dev |
| `access` | Cloudflare Access JWT (the previous owner-private setup) | only when set explicitly |
| `sites` | Hosted Sites headers | the hosted Sites deployment |

To make the hosted site public, judges included, run `PORTI_AUTH_MODE=near` (the default) **and remove the Cloudflare Access application** in the Cloudflare dashboard. Otherwise Access still blocks visitors before the Worker runs.

Data created under the old Access identity (`cf-access:…`) is not carried over to wallet sessions (`near:<account>`).

## One connection throughout Porti

After sign-in redirects to the dashboard, Porti restores the selected provider with
`getConnectedWallet()` without opening the wallet selector or calling `signIn`.
The provider's account must match the authenticated account. The same wallet and
account are shared with Swap, Stake NEAR, Buy NEAR, Transfers, Care and Phone pocket.
`POST /api/auth {action:"restore-wallet"}` reuses the verified login to establish
the main-wallet role in that account's own workspace, without a second signature.
It requires same-origin access, a valid session and the matching server identity;
it cannot replace a different main wallet or use the agent account as main.
No private keys or spending permissions are stored. Locked/disconnected providers
and mismatched accounts require an explicit reconnect. Individual transactions
still require the wallet's normal approval. Username linking remains a separate
explicit action.

## Local

`npm run db:local -- migrate` applies the auth tables. On localhost, the old instant test sign-in (`/signin-with-chatgpt`) now just redirects home.
