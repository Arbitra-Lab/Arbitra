# Protocol Documentation Hub

This is the single entry point into the Arbitra protocol's documentation — the
Soroban smart contracts that implement escrow, arbitration, payments, and the
rental-marketplace reference application. Every document under `contract/docs/`
is indexed below, grouped by what you're trying to do.

For the contract source layout and workspace structure, see [`contract/README.md`](../README.md).

## Quick Links

**New to the protocol?** Start here:

1. [Environment Setup](./getting-started/SETUP.md) — toolchain, Soroban CLI, local setup
2. [Your First Soroban Contract](./getting-started/FIRST-CONTRACT.md) — build and deploy a minimal contract
3. [Testing Basics](./getting-started/TESTING-BASICS.md) — running the test suite
4. [Architecture Overview](./architecture/OVERVIEW.md) — how the 8 contracts fit together

**Operating the protocol in production?**

- [Emergency Procedures](./security/EMERGENCY-PROCEDURES.md) — pause/unpause, incident response
- [Protocol Backup and Recovery](./security/BACKUP-AND-RECOVERY.md) — what to back up and how to recover
- [Contract Upgrades](./deployment/UPGRADES.md) — upgrade, migration, and rollback procedures
- [Testnet Deployment](./deployment/TESTNET_DEPLOYMENT.md)

## Getting Started

| Doc | Description |
| --- | --- |
| [SETUP.md](./getting-started/SETUP.md) | Toolchain and environment setup |
| [FIRST-CONTRACT.md](./getting-started/FIRST-CONTRACT.md) | Building and deploying your first contract |
| [TESTING-BASICS.md](./getting-started/TESTING-BASICS.md) | Running and writing basic tests |

## Architecture

| Doc | Description |
| --- | --- |
| [OVERVIEW.md](./architecture/OVERVIEW.md) | System architecture, contract interactions, data flow |
| [DESIGN-PATTERNS.md](./architecture/DESIGN-PATTERNS.md) | Storage, event, authorization, and timeout patterns used across contracts |

## Contracts

Per-contract reference, one doc per workspace member in `contracts/`:

| Doc | Description |
| --- | --- |
| [ARBITRA-AGREEMENT.md](./contracts/ARBITRA-AGREEMENT.md) | Rental agreement orchestration, lifecycle, emergency pause |
| [ESCROW.md](./contracts/ESCROW.md) | Generic 2-of-3 multi-sig escrow, timeout release |
| [DISPUTE-RESOLUTION.md](./contracts/DISPUTE-RESOLUTION.md) | Case-agnostic arbitration, voting, timeout auto-resolution |
| [PAYMENT.md](./contracts/PAYMENT.md) | Rent / recurring payment processing |
| [AGENT-REGISTRY.md](./contracts/AGENT-REGISTRY.md) | Agent registration and permissions |
| [PROPERTY-REGISTRY.md](./contracts/PROPERTY-REGISTRY.md) | Property registration and verification |

## Integration

| Doc | Description |
| --- | --- |
| [STELLAR-INTEGRATION.md](./integration/STELLAR-INTEGRATION.md) | Integrating with the Stellar network |
| [BACKEND-INTEGRATION.md](./integration/BACKEND-INTEGRATION.md) | Wiring contracts into the NestJS backend |
| [FRONTEND-INTEGRATION.md](./integration/FRONTEND-INTEGRATION.md) | Calling contracts from the Next.js frontend |
| [EXTERNAL-CONTRACTS.md](./integration/EXTERNAL-CONTRACTS.md) | Interacting with external/third-party contracts |

## Reference

| Doc | Description |
| --- | --- |
| [ERROR-REFERENCE.md](./reference/ERROR-REFERENCE.md) | All contract error variants |
| [EVENT-REFERENCE.md](./reference/EVENT-REFERENCE.md) | All emitted events and their payloads |
| [STORAGE-KEYS.md](./reference/STORAGE-KEYS.md) | Storage key naming conventions per contract |
| [TYPE-REFERENCE.md](./reference/TYPE-REFERENCE.md) | Shared data structures and types |

## Security & Operations

| Doc | Description |
| --- | --- |
| [EMERGENCY-PROCEDURES.md](./security/EMERGENCY-PROCEDURES.md) | Pause mechanism, circuit breakers, incident response, escalation |
| [BACKUP-AND-RECOVERY.md](./security/BACKUP-AND-RECOVERY.md) | Protocol backup scope, procedures, and recovery runbooks |

## Deployment

| Doc | Description |
| --- | --- |
| [TESTNET_DEPLOYMENT.md](./deployment/TESTNET_DEPLOYMENT.md) | Deploying contracts to testnet |
| [UPGRADES.md](./deployment/UPGRADES.md) | Upgrade strategies, migration, and rollback |

## Performance

| Doc | Description |
| --- | --- |
| [BENCHMARKING.md](./performance/BENCHMARKING.md) | Benchmarking methodology |
| [GAS-ESTIMATION.md](./performance/GAS-ESTIMATION.md) | Estimating transaction costs |
| [OPTIMIZATION.md](./performance/OPTIMIZATION.md) | Storage and computation optimization strategies |
| [SCALING.md](./performance/SCALING.md) | Horizontal/vertical scaling strategies |

## Testing

| Doc | Description |
| --- | --- |
| [TESTING-STRATEGY.md](./testing/TESTING-STRATEGY.md) | Overall testing approach |
| [UNIT-TESTS.md](./testing/UNIT-TESTS.md) | Writing unit tests |
| [INTEGRATION-TESTS.md](./testing/INTEGRATION-TESTS.md) | Writing cross-contract integration tests |
| [TEST-COVERAGE.md](./testing/TEST-COVERAGE.md) | Coverage requirements |
| [DEBUGGING.md](./testing/DEBUGGING.md) | Debugging failing tests |
| [INTEGRATION_AND_TEST_VERIFICATION.md](./INTEGRATION_AND_TEST_VERIFICATION.md) | PR-ready integration/test verification checklist |

## Troubleshooting

| Doc | Description |
| --- | --- |
| [FAQ.md](./troubleshooting/FAQ.md) | Frequently asked questions |
| [COMMON-ISSUES.md](./troubleshooting/COMMON-ISSUES.md) | Common issues and solutions |
| [ERROR-CODES.md](./troubleshooting/ERROR-CODES.md) | Error code reference |
| [DEBUGGING-GUIDE.md](./troubleshooting/DEBUGGING-GUIDE.md) | General contract debugging guide |

## Related Documentation

- [`contract/README.md`](../README.md) — workspace structure, emergency pause, timeout mechanisms
- [`contract/scripts/README.md`](../scripts/README.md) — deployment scripts
- [`backend/docs/`](../../backend/docs/) — backend service documentation
- [`docs/`](../../docs/) — repo-wide operational documentation
