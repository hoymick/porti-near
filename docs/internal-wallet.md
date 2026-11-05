# Porti internal agent wallet — free device option

## Default: free device wallet

Porti now defaults to an Ed25519 NEAR implicit wallet generated in the user’s browser. It needs no Seams project, provider credits or paid wallet API. This generates an address locally; it does not create a funded on-chain account. Activation requires an on-chain NEAR transfer, which can have a 0 NEAR deposit; network/account-creation charges are paid by the sender. A positive deposit is optional and adds funds for spending. Do not send fungible tokens to activate an address.

The browser encrypts the PKCS8 signing key with AES-256-GCM using a random 16-byte salt, a fresh 12-byte IV and PBKDF2-SHA-256 at 600,000 iterations. A unique 12–256 character password is required. Address, public key, format, network and creation metadata are authenticated as encryption additional data. The encrypted record is stored in IndexedDB in a namespace derived from the authenticated Porti owner. This namespace prevents accidental account mixing; it is not an independent security boundary against same-origin JavaScript.

Before funding/linking, the user must download and confirm an encrypted JSON backup. Restore checks the password, authenticated metadata, public-key/address relation and an actual signature before saving; it cannot overwrite an existing wallet. The password is not recoverable. Store backup and password separately. Clearing browser storage, a different device or a changed Site domain requires restoring the backup. A backup does not preserve the app’s transaction journal on another device.

Unlocked signing keys are non-extractable WebCrypto keys kept only in memory. Lock after five minutes, hiding the tab or leaving the wallet’s component. Every ownership signature and outgoing transaction opens a separate visible approval screen; closing the panel, cancellation or expiry blocks signing. The AI has no signing tool. An account is linked only after the server’s existing NEP-413 proof and finalized on-chain access-key verification succeed.

The local adapter supports reviewed Transfer and FunctionCall only, preserves exact action values, and rejects key-management actions. It checks mainnet and the current full-access key. Transactions are serialized with pinned near-api-js, hashed and signed with Ed25519. Before the single broadcast request it durably saves the precomputed transaction hash. Web Locks coordinate signing across tabs on this origin. Pending/unknown requests block another transaction until the original hash has a finalized network outcome. There is no automatic rebroadcast or timeout-based reset. App transfer/stake receipt verification remains separate; a finalized network result alone is not proof of token delivery.

**Threat model:** this is a browser-local software wallet, not the isolated managed-wallet iframe or hardware custody. Compromised same-origin JavaScript, malicious extensions, weak passwords or a compromised unlocked device can compromise funds. Porti does not claim an independent wallet security audit. Use small pilot balances only after owner acceptance.

Acceptance: automated tests cover encryption/restore, wrong passwords, tampering, NEP-413 verification, independently checked transaction signatures, activation gating, cancellation, locking during approval, exact-action binding, durable-journal failure and ambiguous sends. Real browser wallet creation, funded activation, restore on another device and a manually approved finalized transaction still require the wallet owner. No production wallet was created or funded during automated QA.

Requires a secure HTTPS origin, IndexedDB, Ed25519 WebCrypto, Web Locks and access to the public NEAR mainnet RPC. RPC outages remain visible and cannot produce a false activation result. Legacy HTTP-200 query errors are normalized; a missing access key triggers an account-existence lookup before an address is labeled as awaiting its first deposit. An existing account with a missing key is a separate error, never a funding prompt.

## Optional managed passkey service

The following sections describe the existing optional Seams integration, not a requirement for free device wallets.


## What changed

The old “Create a NEAR wallet” control was only a link to Meteor. It did not create a wallet inside Porti. The Wallets screen now distinguishes **Create / unlock inside Porti** from connecting an existing external account. The embedded panel supports the Seams registration/unlock interface and Porti ownership verification, with a persistent browser signing session while navigating Porti.

**The optional managed passkey option is blocked until the owner provisions a compatible wallet service.** This repository includes the application integration, not Seams' separate Wallet Gateway, MPC infrastructure, registration sponsorship or hosted wallet-origin runtime. An AI key cannot replace those services. Do not present the setup panel as successful wallet creation.

## Exact runtime settings

| Setting | Value to obtain from the wallet environment |
| --- | --- |
| `PORTI_SEAMS_WALLET_ORIGIN` | Dedicated HTTPS wallet origin serving `/wallet-service` and `/sdk/*`. Must differ from Porti's origin. |
| `PORTI_SEAMS_RELAYER_URL` | HTTPS Gateway / registration API base URL. |
| `PORTI_SEAMS_PUBLISHABLE_KEY` | Public managed-registration key for the mainnet environment; never a secret API key. |
| `PORTI_SEAMS_PROJECT_ENVIRONMENT_ID` | Matching environment identifier. |
| `PORTI_SEAMS_RELAYER_ACCOUNT` | Real NEAR-mainnet sponsor / parent account configured by that environment. |
| `PORTI_SEAMS_HOST_VERSION` | `0.34.0`, matching the pinned published application SDK and wallet iframe protocol `21.0.0`. |

These values are public browser configuration. Private Gateway/operator credentials remain with the wallet infrastructure; never expose them through this route. If the service only offers a different release, upgrade the SDK and hosted service together and rerun acceptance rather than changing the version flag alone.

Allow the exact application origin `https://wif-port-agent.catoptica-5751.chatgpt.site` in the environment's registration policies, Gateway CORS, framing and iframe messaging policies. Serve the provider's registration and WebAuthn prompts from a separate trusted HTTPS origin. Do not proxy that wallet origin through Porti or bypass TLS checks. Confirm passkey creation/get permissions and WASM/worker delivery under the production hosting policies. The wallet host must be configured for mainnet and sponsored named NEAR account registration, with sponsorship available. No public testnet sponsor or guessed production host is hardcoded.

## User flow

1. Wallet → Wallets → Create or unlock internal wallet opens an in-app setup panel.
2. If configuration is incomplete, Porti lists the missing setting names and offers Recheck setup. No external registration starts.
3. With an active compatible host, the user selects Create new wallet or Unlock existing wallet. The protected provider UI handles passkeys and recovery. The user must perform device authentication and preserve recovery information themselves.
4. Registration or authentication alone is not account activation. If the NEAR signer is pending, Porti shows Activation pending and offers a session refresh; do not create a replacement wallet to retry it.
5. Once a NEAR account is ready, the user confirms completion of recovery backup and clicks Verify and use as agent wallet. This requests an ownership signature, then checks the current finalized full-access key. It does not transfer funds.
6. Only after verification does Porti save the agent role and select that account as its transaction source. Main and agent accounts must differ. Deposit controls use the verified account.
7. Locking invalidates the selected embedded source. Saved address links survive reload; signing requires unlocking again. Unlinking a role does not delete the provider wallet or its funds.

## Ownership and signing boundary

Seams 0.34 generates its own NEP-413 nonce rather than accepting a caller-supplied nonce. Porti therefore issues a wallet-nonce challenge whose **server-generated random nonce is included verbatim in the signed message**. Verification uses the returned wallet nonce only for that explicit challenge mode. The domain, message, account, server challenge and expiry remain bound, and the challenge is consumed atomically. Existing external wallets retain the server-nonce verification path. Username profiles support the same embedded proof mode.

The adapter preserves the exact reviewed receiver, deposit, gas and arguments. It supports only Transfer and FunctionCall; it rejects key-management and account-deletion actions. Every signing request forces a visible `modal` / `requireClick` confirmation regardless of saved wallet UI preferences. The AI tool loop receives no signing capability. No raw signing key, passkey material or recovery code is returned to Porti.

Unknown or unresolved outcomes must be reconciled through the saved request and original transaction hash. The adapter never resubmits automatically. SDK success and a returned hash are not substitutes for Porti's strict finalized transfer/staking evidence. Swaps retain their separately labeled provider-reported destination status.

## Acceptance before funding

Automated tests cover configuration gating, exact action mapping, signer changes, forced confirmation, unknown outcomes and cryptographic nonce-mode verification. They do not certify the provider's custody or infrastructure.

Owner acceptance still requires: compatible live infrastructure, registration sponsorship, real browser passkey creation/unlock, recovery on another authorized device, expected NEAR mainnet account activation, replay rejection, lock/session expiry, username linking, cancelled approval, and a small manually approved transaction with verified final evidence. No real wallet or passkey was created during development QA. Do not fund a newly displayed account until these checks succeed.

Provider references: https://github.com/seams-tech/seams-wallet and the installed `@seams/wallet@0.34.0/README.md`. The repository's development branch can be newer than the published package; the installed declarations define this integration.

### Funding UI

The free wallet shows Wallet created, NEAR balance, Fund wallet and Refresh balance. Fund wallet reveals the exact address and copy control; it does not broadcast a transaction or create a checkout. The user sends native NEAR from an existing wallet or exchange. There is no separate user activation step. First-deposit account creation happens on NEAR; the sender pays the applicable charges. Internally, finalized key existence is still required before linking and signing. Zero-balance existing accounts remain eligible for ownership linking.
