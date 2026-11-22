# Assigned issues #23, #6, #24, #7: delivery notes

This batch implements the in-repo portions of four assigned issues. Some
acceptance criteria depend on production infrastructure, protocol operators or
third-party services. Those are listed below so the state of the work is
unambiguous. No infrastructure-dependent criterion is marked as delivered.

## #23 Intelligent dispute assignment

Delivered: case complexity scoring, arbiter performance weights, jurisdiction
and language matching, conflict/liveness handling retained from the existing
service, an `ARBITER_ASSIGNED` audit trail for both successful and empty-pool
assignments, persisted arbiter preferences (`jurisdictions`, `languages`,
`averageResolutionHours`) and a migration. Reputation is clamped before it is
normalised so an arbiter above 100 cannot distort scoring.

Follow-up: the model is deterministic and local. ML-based prediction, offline
training and behavioural load forecasting are separate work.

## #6 Generic escrow interface

Delivered: an agreement-agnostic escrow facade (`GenericEscrowService`) with a
neutral DTO and endpoints (`POST /stellar/escrow/generic`,
`POST /stellar/escrow/generic/asset`), native and issued Stellar asset handling,
Horizon asset verification through `assets().forCode().forIssuer()`, explicit
2-of-3 multisig validation, fee-split validation (at most two recipients, no
more than 100% in basis points), Soroban token-contract validation, persistence
of the plan in escrow metadata, and a creation form with form/hook/component
tests.

Follow-up: the on-chain escrow contract, Soroban RPC endpoint and a deployed
token contract id are supplied by deployment configuration
(`GENERIC_ESCROW_TOKEN_ID` or the request). Horizon lookup failures are reported
as `503`, never as a successful verification. Issued assets are verified as
existing on Horizon, but trustline/authentication setup for the depositor is
wallet-side work.

## #24 Protocol governance system

Delivered: a DB-backed governance module (proposals, one record per vote with a
per-proposal power snapshot, token balances, idempotent distributions and a
parameter store), explicit status transitions, quorum and decisive-vote
threshold rules with quorum counting abstentions, bounded parameter validation,
incremental tallies so changing a vote cannot double-count, automatic
parameter-change execution, `GENERAL` proposals and `ARBITER_QUALIFICATION`
votes, an `EMERGENCY_UPGRADE` path that queues rather than claims execution,
analytics, and an admin dashboard with creation/vote/execute UI and tests.

Follow-up:

- On-chain protocol upgrades are queued only. Execution needs the protocol
  operator and the upgrade authority, which are not available in-repo.
- Token distribution here updates the DB ledger. Minting/distribution on the
  Stellar asset, vesting schedules and airdrop infrastructure are separate work.
- Governance token economics and delegation beyond the calculated voting power
  are product decisions outside these issues.

## #7 Arbiter registration system

Delivered: an application and verification workflow (`ArbiterApplication`
entity, apply/list/review/suspend endpoints), KYC gating that reuses the
existing KYC module (only `APPROVED` KYC records may be reviewed), qualification
review notes, on-chain registration via the existing dispute-contract service
with failures surfaced as `503` and the application left pending, activation of
the local arbiter record only after chain success, a deterministic reputation
score (success rate, participation and timeliness), reputation-derived weighted
vote weights, a case-assignment dashboard with active/closed counts and success
rate, admin analytics, and an application form, review panel and dashboard UI
with tests.

Follow-up:

- The KYC provider (document verification, sanctions screening, webhook
  lifecycle) is existing infrastructure. This workflow consumes its status and
  records a reference; it does not implement a KYC vendor integration.
- Blockchain registration, deregistration and reputation updates call the
  existing Soroban contract service. A deployed contract and funded operator
  account are deployment concerns.
- Arbiter analytics are computed from the local DB; cross-chain aggregation and
  a reporting/export pipeline are separate product work.
