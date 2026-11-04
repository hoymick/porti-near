# WIF PORT version 0.3 implementation review

The app now has two explicit modes: a demo ledger and a separate wallet-controlled WIF purchase flow. They never share balances.

| Specification area | Implementation | Verification and remaining boundary |
| --- | --- | --- |
| User interface | Rounded Fredoka and Nunito fonts, original Porti anime guide, outlined pastel dashboard and plain-language journey | Desktop and mobile browser checks required after publication |
| Document ingestion | TXT, Markdown and browser-local text PDF extraction with PDF.js | 3 MB, 20 pages, 30,000 characters and 200 passages maximum; no OCR or encrypted PDFs |
| Comparison and reports | Deterministic source-referenced comparison; JSON and standalone safe HTML export | No model-backed AI connection; the user declined the offered connection |
| Demo spending controls | Per-call, task, UTC-day and lifetime limits, permissions, pause, recovery and persistence | Server-enforced; demo credits are explicitly simulated |
| Wallet connection | Explicit EIP-6963 wallet selection and network/token verification | No automatic connection; real wallet actions are left to the user |
| Vault deployment and funding | Compiled contract deployment, runtime code matching, exact approval, deposit, available withdrawal, session-agent policy and revocation | Implemented; no real wallet deployment or payment has been performed by the assistant |
| Service payments | Gateway signs immutable quotes; session agent signs; wallet relays reservations and signed delivery settlement | Contract scenarios run locally; a complete live network run still needs user funds and wallet approvals |
| Failed jobs | Attestor-signed cancellation or permissionless expiry; recovery reads onchain state | A reservation does not permit arbitrary withdrawals |
| Receipts | Result digest, job identity and settlement event are checked against the transaction | L2 inclusion is shown; no claim of Ethereum finality |
| RPC connectivity | Official public endpoint by default, plus owner-configured provider endpoint encrypted with AES-GCM | A service connection check must pass before vault deployment or attachment |
| API access | Private owner-session gateway and sandbox SDK | Public signed-API authentication is not implemented; hosting audience is unchanged |
| Agent runtime | Browser advances the bounded workflow; retries use the same recorded purchase transaction | No unattended execution; session private key is memory-only and clears on reload |
| Retention | Manual deletion for demo documents; access-triggered cleanup after seven days for demo and live records | No scheduled deletion service |
| Production readiness | Local contract, accounting, concurrency, export and persistence checks | Unaudited prototype; external providers and model-backed analysis remain outside the completed integration |

The full specification is still not a completed production release. Most of its purchase path is implemented, but live acceptance requires an actual network run, a configured model if semantic AI is desired, and production security review.

## Visual direction

The user supplied Pudgy Penguins as a reference for friendly typography and illustration. This build uses the open fonts Fredoka and Nunito, soft blue/lilac/peach surfaces, bold outlines and an original anime guide. It does not claim to use Pudgy Penguins' exact commercial typeface or licensed characters. Robin Neon remains an accent.

The original illustration is stored at `public/porti-guide.png`. It was generated with the built-in image generator using the brief: an original friendly chibi agent with lime-green eyes and scarf, a clipboard, clean thick outlines and 2D cel shading on transparency. The delivered illustration is an anime courier character.
