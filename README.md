# Arbitra

**Arbitra** is an open-source **on-chain arbitration and escrow protocol** built on the **Stellar blockchain**. It gives any two-party agreement — a rental, a freelance milestone, a trade-finance shipment, an insurance claim — a trustless way to hold funds and settle disputes, without either party having to trust a middleman or the other side.

Arbitra focuses on what blockchains do best: **money movement, trust minimization, and verifiable agreements**, while keeping complex business logic off-chain for usability and scale.

Our goal is to give any marketplace or platform a shared, credibly-neutral trust layer — instant settlement, low fees, and arbitration that isn't owned by either party to the dispute.

---

## Why Arbitra?

Two-party agreements that move money today suffer from the same handful of problems, regardless of vertical:

- No good way to hold funds neutrally until both sides agree they got what they paid for
- Disputes get decided by whichever party runs the platform — or don't get decided at all
- High transaction costs for cross-border or multi-currency settlement
- Every marketplace re-builds its own (usually worse) version of escrow and dispute handling from scratch

**Arbitra solves this with two composable primitives — a generic escrow contract and a generic arbitration engine — that any registry contract can plug into.**

---

## Why Stellar?

Arbitra is designed **specifically for Stellar**, not just deployed on it.

Stellar enables:

- **Fast finality** (seconds)
- **Ultra-low transaction fees**
- **Built-in decentralized exchange (DEX)**
- **Anchor-based fiat on/off-ramps**
- **Multi-sig & conditional transactions** for escrow-like flows

This makes Stellar ideal for:

- Milestone and rent-style recurring payments
- Security deposits and escrow-held funds
- Automated fee/commission splits
- Multi-currency settlement

---

## The Protocol

Arbitra is **not** a monolithic on-chain app. It's a small set of composable Soroban contracts plus a hybrid off-chain layer for everything that doesn't need to live on a blockchain.

### On-Chain (Stellar / Soroban)

- **`escrow`** — generic 2-of-3 multi-sig escrow. Funds are locked by a depositor, released to a beneficiary on mutual approval, arbiter ruling, or timeout. Optional platform/referral fee splits; a plain 2-party escrow takes neither.
- **`dispute_resolution`** — a standalone arbitration engine. Any registry contract (escrow, or something else entirely) can route a dispute through it as long as it exposes a `get_case(case_id) -> Option<Case>` view of who the parties are and whether the case is active. Handles arbiter registration, weighted voting, appeals, and timeouts.
- **`payment`**, **`agent_registry`**, **`property_registry`**, **`rent_obligation`**, **`user_profile`** — supporting contracts for Arbitra's first reference application, a rental marketplace (see below).

### Off-Chain

- Listings, profiles, matching, discovery
- Messaging & notifications
- Compliance, KYC, and moderation

This keeps costs low while preserving decentralization where it matters most: the money and the ruling.

---

## Core Concepts

### 1. Generic Escrow

- Any depositor/beneficiary pair can open an escrow in any Stellar asset
- Funds release on mutual approval, arbiter ruling, or timeout — never unilaterally
- Fee splits (platform, referral) are opt-in, not assumed

### 2. Case-Agnostic Arbitration

- `dispute_resolution` doesn't know or care what kind of agreement it's arbitrating
- Arbiters are registered once, vote (optionally weighted by reputation), and their ruling is enforceable by whatever contract raised the case
- Appeals and timeout-based auto-resolution are built in, so a case can't stall forever

### 3. Rental Marketplace (reference application)

Arbitra's first production use of these primitives is a rental platform connecting landlords, agents, and tenants — rent payments, security deposits, and agent commissions, with disputes arbitrated through the same generic engine above.

---

## Architecture Overview

```text
Frontend (Web / Mobile)
   │
   ├── Listings & Dashboards
   ├── Payment / Escrow UI
   │
Backend (API + Indexer)
   │
   ├── Business Logic
   ├── Stellar SDK Integration
   ├── Compliance Hooks
   │
Stellar Network
   │
   ├── escrow ── dispute_resolution
   ├── Asset Issuance & Payments
   ├── DEX Swaps
```

---

## Deployed Contracts (Testnet)

All Soroban contracts are currently deployed on **Stellar Testnet**. Click an address to view it on Stellar Expert.

| Contract | Contract ID |
| --- | --- |
| Escrow | [`CDDUZKXCDSK3TZVFUUEEJRMSFNILCUEO5E5RORTREEH4KOALQC637DEZ`](https://stellar.expert/explorer/testnet/contract/CDDUZKXCDSK3TZVFUUEEJRMSFNILCUEO5E5RORTREEH4KOALQC637DEZ) |
| Dispute Resolution | [`CA4GNSPPX6RMHPKMJB5GSOKQU6WDPBEGMPSU3SJ5SEJWA5F7RFK2NN65`](https://stellar.expert/explorer/testnet/contract/CA4GNSPPX6RMHPKMJB5GSOKQU6WDPBEGMPSU3SJ5SEJWA5F7RFK2NN65) |
| Payment | [`CDXNI4WNAIFVVN5RIVETAENYYQ5OTT7TLFQSF2JWAHU3X3B3RT5KQBED`](https://stellar.expert/explorer/testnet/contract/CDXNI4WNAIFVVN5RIVETAENYYQ5OTT7TLFQSF2JWAHU3X3B3RT5KQBED) |
| Agent Registry | [`CBJHWU7LO6QCIOBGS5P6V45FV4NT4RXCQNSGIYM5MUSP36QPAZFQRSSM`](https://stellar.expert/explorer/testnet/contract/CBJHWU7LO6QCIOBGS5P6V45FV4NT4RXCQNSGIYM5MUSP36QPAZFQRSSM) |
| Property Registry | [`CAUHZN2FUPS7GVV2TYTUYCKG7CZX5NY7K6RA6INZ4KOGMUBRC4L4QJI7`](https://stellar.expert/explorer/testnet/contract/CAUHZN2FUPS7GVV2TYTUYCKG7CZX5NY7K6RA6INZ4KOGMUBRC4L4QJI7) |
| Rent Obligation | [`CBGPDLUDTVHUR7HZPZ45CM6SYBISC2LQHMVVSEIVFA6WWZX24PIGDNOM`](https://stellar.expert/explorer/testnet/contract/CBGPDLUDTVHUR7HZPZ45CM6SYBISC2LQHMVVSEIVFA6WWZX24PIGDNOM) |
| User Profile | [`CDEK2S5U36ELIGZW23EXHGYCWENGLMLHL47ZKQWPOMLO4GTK5O2YSMMH`](https://stellar.expert/explorer/testnet/contract/CDEK2S5U36ELIGZW23EXHGYCWENGLMLHL47ZKQWPOMLO4GTK5O2YSMMH) |
| Huston Housing (Rental Agreement) | [`CBFLJVOHQ2LRVUMYBZQCHCVP5JGZ6WFTOSMYYUZQHAPHX6JKSDQXF5JD`](https://stellar.expert/explorer/testnet/contract/CBFLJVOHQ2LRVUMYBZQCHCVP5JGZ6WFTOSMYYUZQHAPHX6JKSDQXF5JD) |

These IDs are also available in [`frontend/.env.example`](frontend/.env.example) and [`contract/.env.testnet.example`](contract/.env.testnet.example). Contracts are redeployed periodically during active development — if an address here doesn't resolve, check [`contract/docs/deployment/`](contract/docs/deployment/) for the latest.

---

## Open Source First

Arbitra is being built **fully open-source**.

We welcome:

- Contributors
- Reviewers
- Anchor operators
- Protocol researchers

---

## You Should Know

Arbitra is not just a rental app.

It is **open trust infrastructure** — a generic escrow and arbitration protocol built on Stellar, with a rental marketplace as its first reference implementation, designed to scale across verticals, borders, and currencies.

## Property Listing Wizard

The Property Listing Wizard is a guided 8-step flow for landlords to create high-quality rental listings with AI-assisted content generation and automated draft saving.

### API Endpoints

- `POST /property-listings/wizard/start` - Initialize a new property draft.
- `GET /property-listings/wizard/:id/draft` - Resume an existing draft.
- `PATCH /property-listings/wizard/:id/step` - Save current step data and run validation.
- `DELETE /property-listings/wizard/:id/draft` - Discard a draft.
- `POST /property-listings/wizard/:id/publish` - Finalize and publish the property.

### AI Features

The wizard includes server-side AI helpers for:

- **Pricing Suggestions**: Recommended rent ranges based on property type and location.
- **Description Generation**: Compelling property and neighborhood blurbs.
- **Completeness Scoring**: Real-time analysis of listing quality with improvement tips.

### Draft Expiry

Drafts automatically expire after **30 days** of inactivity. A cleanup task runs periodically to remove expired drafts.
