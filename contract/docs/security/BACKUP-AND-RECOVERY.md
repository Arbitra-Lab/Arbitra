# Protocol Backup and Recovery

**Priority:** HIGH
**Category:** Documentation
**Type:** Documentation
**Status:** Completed
**Related:** [Emergency Procedures](./EMERGENCY-PROCEDURES.md), [Contract Upgrades](../deployment/UPGRADES.md)

## Introduction

This document defines what must be backed up to safely operate and recover the
Arbitra protocol (the on-chain Soroban contracts), and the procedures for
restoring each piece in a recovery scenario.

The Stellar ledger itself is replicated and durable, so the protocol's backup
problem is not "back up a database" — it is: can the team reconstruct
deployment state, re-derive or restore contract storage, and regain
operational control (admin keys) if something is lost or corrupted? This
document is scoped to the contract/protocol layer. For backend database
backup and recovery (off-chain Postgres data), see
[`backend/docs/deployment/BACKUP_AND_RECOVERY.md`](../../../backend/docs/deployment/BACKUP_AND_RECOVERY.md).

## Quick Links

- [Emergency Procedures](./EMERGENCY-PROCEDURES.md) — pause/unpause, incident response, escalation
- [Contract Upgrades](../deployment/UPGRADES.md) — `export_state` / `import_state`, migration, rollback
- [Testnet Deployment](../deployment/TESTNET_DEPLOYMENT.md)
- [Protocol Documentation Hub](../README.md)

---

## 1. What Needs to Be Backed Up

| Asset | Why it matters | Loss impact |
| --- | --- | --- |
| Admin / deployer secret keys | Required to call admin-only functions (`pause`, `unpause`, `upgrade`, `set_timeout_config`, `record_version`, etc.) | Loss of operational control over the protocol; cannot pause during an incident |
| Contract WASM binaries (per version, per network) | Needed to redeploy an identical contract or verify a deployed hash | Cannot reproduce or verify a historical deployment |
| Contract source + Cargo.lock at each deployed commit | Needed to rebuild the exact WASM that matches an on-chain hash | Cannot audit or rebuild a past deployment |
| Deployment metadata (contract IDs per network, WASM hashes, deploy timestamps) | Needed to know what is actually running in production | Operators lose track of which contract address is authoritative |
| On-chain persistent storage (agreements, escrows, disputes, payments, registries) | The protocol's live state | Already durable via the Stellar ledger/validators; see [§2](#2-on-chain-state-is-not-your-backup-problem) |
| Event history (`payment:*`, `escrow:*`, `dispute:*`, `nft:*`, pause/unpause events) | Used to rebuild off-chain read models and for audit/forensics | Backend indexers lose the ability to replay history |

## 2. On-Chain State Is Not Your Backup Problem

Persistent contract storage is replicated across the Stellar validator network.
As long as the network is healthy, contract storage does not need a
traditional backup/restore pipeline — it already survives individual node or
infrastructure failure. What the protocol team is responsible for backing up
is everything storage depends on to be *useful and recoverable by this team*:
keys, binaries, source, and deployment records (see [§1](#1-what-needs-to-be-backed-up)).

The one exception is **recoverable snapshots for migration/rollback**, covered
in [§4](#4-state-snapshot-backups-for-migration--rollback), which uses the
contracts' own `export_state` / `import_state` functions (see
[Contract Upgrades §3.1](../deployment/UPGRADES.md#31-state-migration)).

## 3. Backup Procedures

### 3.1 Admin / Deployer Key Custody

- Production admin keys must be a multi-sig (per [Emergency Procedures §7](./EMERGENCY-PROCEDURES.md#7-emergency-best-practices)), never a single secret.
- Each signer's key is generated and stored offline (hardware wallet or HSM); no signer's key is ever placed in a shared secrets manager, repo, or CI environment.
- Maintain a documented, access-controlled list of signer identities and the quorum threshold for each network (testnet vs. production), separate from the keys themselves.
- Run a signing drill each quarter: produce and submit a trivial admin transaction (e.g. a no-op `set_config`) to confirm the multi-sig can still reach quorum.

### 3.2 WASM and Source Archival

For every contract deployed to testnet or production, archive the following
together under `s3://arbitra-protocol-backups/releases/<contract>/<network>/<wasm_hash>/`:

```bash
#!/bin/bash
# archive-release.sh
set -euo pipefail

CONTRACT="${1}"          # e.g. arbitra_agreement
NETWORK="${2}"           # testnet | production
GIT_SHA="$(git rev-parse HEAD)"

cargo build --release --target wasm32-unknown-unknown -p "${CONTRACT}"
WASM_PATH="target/wasm32-unknown-unknown/release/${CONTRACT}.wasm"
WASM_HASH="$(sha256sum "${WASM_PATH}" | awk '{print $1}')"

DEST="s3://arbitra-protocol-backups/releases/${CONTRACT}/${NETWORK}/${WASM_HASH}"
aws s3 cp "${WASM_PATH}" "${DEST}/${CONTRACT}.wasm" --sse AES256
git archive --format=tar.gz -o /tmp/source.tar.gz "${GIT_SHA}" -- "contracts/${CONTRACT}" Cargo.toml Cargo.lock
aws s3 cp /tmp/source.tar.gz "${DEST}/source.tar.gz" --sse AES256

cat > /tmp/metadata.json <<EOF
{
  "contract": "${CONTRACT}",
  "network": "${NETWORK}",
  "wasm_hash": "${WASM_HASH}",
  "git_sha": "${GIT_SHA}",
  "archived_at": "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
}
EOF
aws s3 cp /tmp/metadata.json "${DEST}/metadata.json" --sse AES256

echo "Archived ${CONTRACT} (${WASM_HASH}) for ${NETWORK}"
```

Run this immediately after every `soroban contract install` / `deploy` /
`upgrade` invocation, in CI, so an archive always exists before the new WASM
goes live.

### 3.3 Deployment Metadata

Keep a single, version-controlled record of what is deployed where —
contract IDs, WASM hashes, and deploy dates per network — alongside the
testnet deployment notes already captured in
[`deployment/TESTNET_DEPLOYMENT.md`](../deployment/TESTNET_DEPLOYMENT.md). Treat
this file as the source of truth operators check before invoking any admin
function, and update it in the same PR/commit as the deploy.

### 3.4 State Snapshot Backups (for migration / rollback)

Before any upgrade or migration, export current contract state using the
contract's own `export_state` function (see
[Contract Upgrades §3.1](../deployment/UPGRADES.md#31-state-migration)) and
archive the result:

```bash
#!/bin/bash
# snapshot-state.sh
set -euo pipefail

NETWORK="${1}"
CONTRACT_ID="${2}"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
OUT="state_${CONTRACT_ID}_${STAMP}.json"

soroban contract invoke \
  --network "${NETWORK}" \
  --id "${CONTRACT_ID}" \
  -- export_state > "${OUT}"

aws s3 cp "${OUT}" "s3://arbitra-protocol-backups/state-snapshots/${NETWORK}/${CONTRACT_ID}/${STAMP}.json" --sse AES256
echo "Snapshot stored: ${STAMP}.json"
```

This is the backup that [Contract Upgrades §4.3 (State Rollback)](../deployment/UPGRADES.md#43-state-rollback)
restores from.

### 3.5 Event History Archival

The backend's event indexer (see [Backend Integration](../integration/BACKEND-INTEGRATION.md))
is the durable, queryable copy of protocol event history. Back it up the same
way as the rest of the backend database — see
[`backend/docs/deployment/BACKUP_AND_RECOVERY.md`](../../../backend/docs/deployment/BACKUP_AND_RECOVERY.md).
If the indexer's database is ever lost, it can also be fully rebuilt from
scratch by replaying on-chain events from ledger genesis (or from the last
known-good ledger sequence), since the ledger is the ultimate source of truth
for event history.

## 4. Backup Schedule and Retention

| Asset | Trigger / Frequency | Retention |
| --- | --- | --- |
| Admin key signing drill | Quarterly | N/A (process, not a stored artifact) |
| WASM + source archive | On every deploy/upgrade (CI-triggered) | Indefinite — never deleted |
| Deployment metadata update | On every deploy/upgrade | Indefinite (version-controlled) |
| State snapshot | Before every upgrade/migration, plus weekly for production | 90 days, except pre-upgrade snapshots which are kept indefinitely |
| Event indexer DB backup | Per [backend backup schedule](../../../backend/docs/deployment/BACKUP_AND_RECOVERY.md) | Per backend retention policy |

## 5. Recovery Procedures

### 5.1 Recovery Scenarios

| Scenario | Recovery Method | RTO | RPO |
| --- | --- | --- | --- |
| Admin key signer unavailable | Quorum still met by remaining signers | Immediate | None |
| Admin key quorum lost (below threshold) | Contract-specific key-rotation path if one exists; otherwise the protocol is stuck in its last admin-set state until a new deployment takes over | N/A — prevention (drills, redundant signers) is the real mitigation | N/A |
| Need to verify/reproduce a deployed contract | Rebuild WASM from archived source + `Cargo.lock`, compare hash to archived `wasm_hash` | 30 minutes | N/A |
| Upgrade/migration introduces a bug | Rollback via [Contract Upgrades §4](../deployment/UPGRADES.md#4-rollback-procedures), restoring from the pre-upgrade state snapshot if state was mutated | 1–2 hours | Up to the last pre-upgrade snapshot |
| Contract behaving unexpectedly / suspected exploit | [Pause](./EMERGENCY-PROCEDURES.md#1-pause-mechanism) immediately, investigate, then follow [Emergency Procedures §3](./EMERGENCY-PROCEDURES.md#3-recovery-procedures) | Pause: minutes. Full resolution: hours–days | N/A (on-chain state is never lost, only frozen) |
| Event indexer database lost | Restore from backend backup, or replay events from ledger | Per [backend recovery procedures](../../../backend/docs/deployment/BACKUP_AND_RECOVERY.md#5-recovery-procedures) | Per backend RPO, or zero (full replay) |

RTO: Recovery Time Objective (maximum acceptable downtime).
RPO: Recovery Point Objective (maximum acceptable data/state loss).

### 5.2 Verify a Deployed Contract Against Backup

```bash
#!/bin/bash
# verify-deployed-contract.sh
set -euo pipefail

NETWORK="${1}"
CONTRACT_ID="${2}"
EXPECTED_HASH="${3}"   # from deployment metadata

ON_CHAIN_HASH="$(soroban contract fetch --network "${NETWORK}" --id "${CONTRACT_ID}" | sha256sum | awk '{print $1}')"

if [ "${ON_CHAIN_HASH}" != "${EXPECTED_HASH}" ]; then
  echo "MISMATCH: on-chain ${ON_CHAIN_HASH} vs expected ${EXPECTED_HASH}"
  exit 1
fi

echo "Verified: deployed contract matches archived WASM hash"
```

### 5.3 Restore State From a Snapshot

Use [Contract Upgrades §4.3 (State Rollback)](../deployment/UPGRADES.md#43-state-rollback)
with the snapshot downloaded from `s3://arbitra-protocol-backups/state-snapshots/`:

```bash
aws s3 cp "s3://arbitra-protocol-backups/state-snapshots/${NETWORK}/${CONTRACT_ID}/${STAMP}.json" ./backup.json
./rollback-state.sh "${NETWORK}" "${CONTRACT_ID}" "${ADMIN_KEY}" ./backup.json
```

### 5.4 Rebuild WASM From Archive for Verification or Redeploy

```bash
aws s3 cp "s3://arbitra-protocol-backups/releases/${CONTRACT}/${NETWORK}/${WASM_HASH}/source.tar.gz" .
tar -xzf source.tar.gz
cargo build --release --target wasm32-unknown-unknown -p "${CONTRACT}"
sha256sum "target/wasm32-unknown-unknown/release/${CONTRACT}.wasm"   # compare to ${WASM_HASH}
```

## 6. Recovery Drills

- **Quarterly:** admin multi-sig signing drill (see [§3.1](#31-admin--deployer-key-custody)) plus a Pause/Unpause drill on testnet (per [Emergency Procedures §7](./EMERGENCY-PROCEDURES.md#7-emergency-best-practices)).
- **Before every production upgrade:** take a state snapshot, then rehearse the rollback procedure against it on testnet.
- **Annually:** full reconstruction drill — rebuild a past production WASM from its archive, verify the hash, and confirm the deployment metadata record for that release is still accurate.

## 7. Checklist

Pre-deploy:

- [ ] Admin keys are multi-sig and offline for production
- [ ] Backup archival step wired into the deploy/upgrade CI job
- [ ] Deployment metadata record ready to update in the same PR

Per deploy/upgrade:

- [ ] WASM + source archived with hash and metadata
- [ ] Deployment metadata updated
- [ ] State snapshot taken before any migration
- [ ] Rollback rehearsed on testnet

Quarterly:

- [ ] Admin signing drill completed
- [ ] Pause/Unpause drill completed
- [ ] Old snapshots beyond retention cleaned up

Annually:

- [ ] Full WASM reconstruction-from-archive drill completed and documented

## 8. References

- [Emergency Procedures](./EMERGENCY-PROCEDURES.md)
- [Contract Upgrades](../deployment/UPGRADES.md)
- [Testnet Deployment](../deployment/TESTNET_DEPLOYMENT.md)
- [Backend Database Backup and Recovery](../../../backend/docs/deployment/BACKUP_AND_RECOVERY.md)
- [Protocol Documentation Hub](../README.md)
