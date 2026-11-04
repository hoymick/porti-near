# Rug Guard v0.5

Rug Guard is a working extension of each token investigation and the watchlist. It is not a calibrated rug-probability model or an audit.

## User features

- Interactive SVG holder bubble map: up to 30 distinct returned holder addresses sorted by balance; bubble area proportional to balance, with a minimum selection radius. Selectable keyboard-accessible nodes, zoom/reset and holder-type/connection filters.
- Transfer evidence links between mapped holders, deduplicated by event identity. Connected components are transfer relationships, not common ownership. Burn addresses are excluded from components. Contracts and unknown address types stay labelled.
- Top-holder table: rank, balance, share of reported total supply, wallet/contract/burn/unknown labels and recorded-creator identification. One-click holder investigation and tracking via the existing watch action.
- Evidence-based flags: known non-contract holder ≥20% (high), connected known-wallet group ≥30% (high), holder ≥10%, top 10 all-types ≥70%, recorded creator holding ≥5%, unverified source, sensitive non-view ABI names (caution). Proxy metadata is context, not proof of abuse.
- Risk watchlist with high/caution/incomplete filters and snapshot check times.
- Snapshot change warnings: known wallet share +3 percentage points; top-10 share +5 points; recorded creator transfer ≥1% of reported supply. Deduplicated in-app inbox; a creator transfer is not labelled a sale. These checks run on successful visible-tab refreshes, not unattended.
- Self-contained printable HTML report with top holders, flags, relationship evidence, method and unanswered checks. User strings are escaped and script execution is blocked by CSP. JSON observation export remains available.

## Data and limits

The existing authenticated Blockscout integration now reads `/smart-contracts/{address}` in addition to holder, transfer and address data. Only bounded ABI function names and proxy metadata are retained; source text is not stored. Public indexer access was unavailable during v0.4 verification, so working provider access is still required for live observations. Fictional sample mode includes a high-concentration linked-holder fixture.

Unknown checks are always displayed: LP size/ownership/locks/unlock dates, honeypot and buy/sell simulation, taxes, privileged roles/ownership/upgrade settings, common funders and full history. No green safe badge or percentage probability is produced. No address is accused of fraud.

## Validation

21 feature tests cover integer shares, unknown supply, holder sorting/deduplication, burns/contracts/unknown types, event relationships, risk flags, repeated-refresh deduplication, creator outflows and escaped HTML exports, plus prior swap/planning cases. TypeScript and production build are required before publication.
