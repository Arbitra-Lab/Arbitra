# Blockchain UI components (Stellar)

Reusable UI for **Freighter** wallet connection, **XDR signing**, **payment steps**, **Horizon balances**, and **Explorer** links. Works with `NEXT_PUBLIC_STELLAR_NETWORK` (`TESTNET` default, `PUBLIC` for mainnet).

**Community:** [Telegram — Arbitra group](https://t.me/arbitragroup)

## Dependencies

- `@stellar/freighter-api` — connect + sign (`lib/stellar-auth.ts`)
- Stellar Horizon (HTTP) — account balances (`lib/stellar-horizon.ts` + `lib/stellar-network.ts`)

## Components

| Component                 | Purpose                                                             |
| ------------------------- | ------------------------------------------------------------------- |
| `WalletConnectButton`     | Connect Freighter, show truncated address, disconnect (app session) |
| `BlockchainStatusBadge`   | Network / wallet / pending / success / error pills                  |
| `AssetBalanceDisplay`     | List of balances from Horizon or mocks                              |
| `StellarAccountViewer`    | Paste a public key → load balances + Expert link                    |
| `TransactionSigningModal` | Preview XDR + sign via Freighter                                    |
| `PaymentFlowWizard`       | Amount → review → `prepareTransaction()` → signing modal            |
| `TransactionHistoryList`  | Rows with hash + amount + Explorer link                             |

## Usage

```tsx
import {
  WalletConnectButton,
  BlockchainStatusBadge,
  TransactionHistoryList,
} from '@/components/blockchain';

import type { BlockchainTxRow } from '@/components/blockchain';
```

`PaymentFlowWizard` expects a **`prepareTransaction`** function that returns **unsigned XDR** (your backend or SDK should build it). The modal then calls `signChallengeXdr` (same Freighter API as auth challenges).

## Error handling

- **Wallet**: errors surface under the connect button and in signing modal.
- **Horizon**: unfunded accounts and HTTP errors show in `AssetBalanceDisplay` / `StellarAccountViewer`.

## Storybook

See `*.stories.tsx` in this folder. Add Storybook to the project if not already configured, then run the Storybook dev server to preview these in isolation.

## Testing

- Use **Stellar testnet** + a funded test account.
- Install **Freighter** and switch network to match the app env.
