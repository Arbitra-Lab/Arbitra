# Arbitra Soroban Contracts

The on-chain layer of [Arbitra](../README.md) — a set of Soroban smart contracts for
generic escrow, arbitration, and a rental-marketplace reference application.

## Project Structure

This is a Cargo workspace; each contract lives in its own directory under `contracts/`:

```text
.
├── contracts
│   ├── arbitra_agreement   # Rental agreement orchestration (lifecycle, payments, escrow hooks)
│   ├── escrow              # Generic 2-of-3 multi-sig escrow
│   ├── dispute_resolution  # Case-agnostic arbitration engine
│   ├── payment             # Rent / recurring payment processing
│   ├── agent_registry      # Agent registration & verification
│   ├── property_registry   # Property registration & verification
│   ├── rent_obligation     # Tokenized rent obligations
│   └── user_profile        # User profile management
├── docs                    # Per-contract and integration documentation
├── scripts                 # Testnet deploy & verification scripts
├── Cargo.toml              # Workspace manifest
└── README.md
```

- Each contract has its own `Cargo.toml` that relies on the top-level workspace for shared dependencies.
- Per-contract documentation lives in [`docs/contracts/`](docs/contracts/).
- See [`scripts/README.md`](scripts/README.md) for deployment.

## Emergency Pause (Arbitra Agreement Contract)

The `contracts/arbitra_agreement` contract includes an emergency pause mechanism:

- `pause(reason)` and `unpause()` are admin-only.
- `is_paused()` exposes current circuit-breaker status.
- Pause metadata is stored as `PauseState` (`is_paused`, `paused_at`, `paused_by`, `pause_reason`).
- Critical mutating operations (booking, payment, escrow, and token-management entrypoints) are blocked while paused.
- `Paused` and `Unpaused` events are emitted for operational monitoring.

## Timeout Mechanisms (Escrow + Dispute Resolution)

Timeout protection is available to prevent stale funds/disputes from remaining open indefinitely.

- Escrow contract supports:
  - `set_timeout_config(caller, config)` / `get_timeout_config()`
  - `release_escrow_on_timeout(escrow_id)` for stale pending/funded escrows (refunds depositor)
  - `resolve_dispute_on_timeout(escrow_id)` for stale disputed escrows (auto-refund path)
  - timeout events: `EscrowTimeout`, `DisputeTimeout`
- Dispute resolution contract supports:
  - admin-configurable timeout settings via `set_timeout_config(admin, config)`
  - `resolve_dispute_on_timeout(agreement_id)` for stale unresolved disputes
  - timeout event: `DisputeTimeout`
