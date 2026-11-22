# Assigned issues #26, #12, #13, #27: delivery notes

This batch implements the in-repo portions of four assigned issues. Each issue
also contains criteria that require production infrastructure, third-party
services or full product features outside these issues. Those are listed below
so the state of the work is unambiguous.

## #27 Dark mode

Delivered: light/dark CSS token sets, system-preference resolution, a pre-paint
script that prevents a flash of the wrong theme, persistence through the
existing settings store, OS-scheme updates while on "system", accessible
`aria-pressed` state on the selector, and themed charts/focus/skip-link tokens.

Follow-up: a small number of legacy components use hardcoded hex colours and do
not yet consume the new tokens.

## #12 WebSocket real-time updates

Delivered: a sliding-window rate limiter for socket events, a typed realtime
domain-event bus, rate-limited `dispute:status`, `vote:cast`, `escrow:released`
and `appeal:submitted` fan-out to user rooms, real emit hooks on dispute status
changes, resolution and vote casting, a 100 ms dedupe micro-batcher that
collapses cache invalidations, client listeners for all four domain events,
and tests for the limiter, emitter, batcher and reconnection behaviour.

Already present and retained: connection management with reconnection and
heartbeat, and server-side notification preferences that gate delivery.

Follow-up (requires infrastructure or separate features):

- Mobile push delivery needs a Web Push/VAPID key pair and device-token store.
- Cross-instance event fan-out needs a broker such as Redis pub/sub; the
  in-process bus only covers a single API process.
- Appeal submission has a typed event and client listener, but the appeal
  workflow itself is not part of this issue.

## #13 Agreement template system

Delivered: an admin template management API (create, edit, submit, approve,
reject, preview), versioning by stable slug with automatic archiving of the
previous approved version, an approval workflow, multi-language/category
fields, escaped HTML rendering, variable validation, deterministic automated
clause-compliance checks, a marketplace listing for approved public templates,
usage recording and per-template analytics, a migration, and an admin UI.

Follow-up: legal-compliance checking here is a deterministic clause checklist,
not legal advice or a third-party legal service. A template marketplace with
billing/reviews and machine translation are separate product work.

## #26 Advanced encryption

Delivered: versioned AES-256-GCM envelopes with `keyId` lookup and legacy
fallback, a per-evidence data-key service with arbiter-scoped selective
disclosure and revocation, commit/reveal confidential vote seals,
channel-derived encrypted messages, access audit logging, and failing-first
crypto tests (tamper rejection, wrong-key rejection, grant isolation,
revocation, legacy envelopes and vote reveal).

Follow-up (require dedicated infrastructure or product work):

- Zero-knowledge proofs are not implemented. The vote seal is an HMAC
  commit/reveal scheme, not a ZKP. Circuit design, trusted setup and verification
  keys are out of scope.
- GDPR compliance is a programme (data-retention policy, subject-access and
  erasure workflows, DPIA); this batch adds auditable access events only.
- Wiring envelope storage into the binary evidence upload/download pipeline
  needs new persistence columns and storage-layer changes.
