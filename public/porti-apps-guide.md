# Porti Apps — integration guide

Porti Apps is the first version of Porti's shared application layer on NEAR mainnet. Projects bring a reviewed adapter into Porti, where users open a native workspace and the assistant can invoke its explicitly registered read actions. Porti remains an application on NEAR, not a new blockchain.

## What ships

- An app directory with search and per-workspace saved pins.
- Rhea Pool Lens: reads the documented Ref exchange contract `v2.ref-finance.near`, `get_number_of_pools`, then one `get_pools` record.
- NEAR Staking Lens: reads `get_total_staked_balance`, `get_number_of_accounts`, and `get_reward_fee_fraction` on user-specified standard `.poolv1.near` / `.pool.near` contracts.
- A shared AI tool layer: `list_porti_apps`, `read_exchange_pool`, `read_staking_pool`.
- Manifest v1 validation and a same-origin SDK client in `sdk/porti-apps.ts`.

These are independent Porti adapters, not endorsements or commercial partnerships. They perform no trades or staking transactions. New manifests are not automatically installed. Third-party code and iframes are not executed.

## Quick start for developers

Import `definePortiApp` and `createPortiAppsClient` from the SDK source. Define a manifest using the example below, and implement a server-side adapter. The manifest validator is also available under Porti Apps → Build for Porti.

```ts
import { definePortiApp, createPortiAppsClient } from './sdk/porti-apps';

const manifest = definePortiApp({
  schemaVersion: 1,
  id: 'my-near-app',
  name: 'My NEAR App',
  version: '1.0.0',
  description: 'Read public state from my NEAR project.',
  category: 'Research',
  network: 'mainnet',
  website: 'https://example.com',
  permissions: ['chain:read'],
  actions: [{ id: 'read-state', label: 'Read project state', effect: 'read' }]
});

// Within Porti's authenticated same-origin frontend:
const porti = createPortiAppsClient();
const directory = await porti.list();
const { result } = await porti.run('rhea-pools', 'read-pool', { poolId: 0 });
await porti.pin('rhea-pools', true);
```

The SDK is source code in this repository, not a published npm package. Do not send Porti session cookies, AI credentials, wallet keys, or private workspace information to project websites.

## Review and registration

1. Supply the manifest, contract accounts, verified source/docs, input and output schemas, read methods, expected errors, and adapter tests through the repository review process.
2. The owner reviews contract destinations, mainnet support, response bounds, permissions and the user interface.
3. Add the validated manifest to `lib/porti-app-registry.ts`, register a fixed server adapter in `lib/porti-apps.ts`, and add an explicitly defined agent tool if needed. Do not accept arbitrary methods or URLs from a manifest.
4. Add the native app workspace and test success, malformed output, unavailable providers and invalid actions.
5. Deploy the reviewed release with the existing Site audience preserved.

Validating JSON only verifies the manifest shape. It does not prove ownership, audit a contract, grant wallet permissions, or confer approval. There is no automated application submission or developer publishing service in this version.

## API

All responses use `Cache-Control: no-store`. Routes require the signed-in workspace owner. Writes require the existing same-origin request guard. Reads are limited to 60/minute and app actions to 12/minute per workspace.

- `GET /api/porti/apps`: `{ apps, pinned }`.
- `POST /api/porti/apps` with `{ action: 'pin', appId, pinned: true }`: updated directory state. Repeating the same pin state is idempotent.
- `POST /api/porti/apps` with `{ action: 'run', appId, actionId: 'read-pool', args }`: `{ result }` containing checked time, data, contract/method and block evidence.

Only exact registered app/action pairs execute. Pool IDs must be safe nonnegative integers bounded at 10,000,000 and below the contract's pool count. Staking account names are validated and constrained to standard pool suffixes. Public contract reads do not require connecting a wallet or configuring AI. Assistant invocation requires NEAR AI Cloud and consumes its credits.

## Evidence and limitations

The first contract read uses finality `final`; subsequent reads are pinned to the same block hash. Each result contains the contract, method, block height and block hash. RPC chain identity is checked by the existing NEAR service. Unavailable/pruned state or malformed contract output fails visibly, without fabricated fallback data.

Exchange reserves are raw token units; they are not a USD value, slippage estimate or an executable quote. Staking fees are fractions of rewards, not APY. Account suffix and schema checks do not establish trustworthiness. This release does not read individual staking positions, execute swaps, deposit funds, or grant access keys.

## Product loop and next stages

Saved pins bring users back to tools they use regularly; shared AI lets the same research workflow span multiple apps. More reviewed adapters expand the work users can complete inside Porti. No growth or retention figures are assumed.

Next: partner-specific transaction preview adapters, exact fees and slippage, existing wallet approval, receipts and revocation. Add isolated third-party panels only after a separate security design. Neither manifests nor AI responses may create transaction permissions by themselves.

## Primary references

- Contract identity: https://guide.rhea.finance/developers/contracts
- Exchange view methods: https://github.com/ref-finance/docs/blob/main/contracts/ref-exchange.md
- Standard staking contract: https://github.com/near/core-contracts/tree/master/staking-pool
