# Resilience Patterns

The backend ships a small set of resilience primitives under
`src/common/resilience` (the global `ResilienceModule`). They keep the platform
responsive when a downstream dependency slows down or fails, and they make
"production readiness" behaviours testable and reusable across feature modules.

| Pattern              | Service                | Purpose                                                       |
| -------------------- | ---------------------- | ------------------------------------------------------------- |
| Bulkhead isolation   | `BulkheadService`      | Cap concurrency per dependency so one can't starve the others |
| Fallback             | `FallbackService`      | Serve a substitute result when the primary call fails         |
| Graceful degradation | `DegradationService`   | Shed non-essential features as health worsens                 |
| Incident tracking    | `IncidentService`      | Track incidents and drive degradation (see INCIDENT_RESPONSE) |

All four are provided by a `@Global()` module, so any feature module can inject
them directly without re-importing.

```ts
constructor(
  private readonly bulkhead: BulkheadService,
  private readonly fallback: FallbackService,
  private readonly degradation: DegradationService,
) {}
```

---

## Bulkhead isolation (`BulkheadService`)

Each named **compartment** has its own concurrency pool (`maxConcurrent`) and a
bounded waiting queue (`maxQueue`). A misbehaving dependency can only exhaust
its own compartment, leaving the rest of the system unaffected. When both the
active slots and the queue are full, further calls are rejected immediately
with `BulkheadCapacityExceededError` (HTTP 503) instead of piling up.

```ts
// Configure once (optional — defaults are 10 concurrent / 20 queued).
this.bulkhead.configure('kyc-provider', { maxConcurrent: 5, maxQueue: 10 });

// Run isolated work.
const result = await this.bulkhead.execute('kyc-provider', () =>
  this.kycClient.verify(payload),
);

// Observe saturation for dashboards / alerts.
this.bulkhead.getMetrics('kyc-provider'); // { active, queued, totalRejected, ... }
```

## Fallback (`FallbackService`)

Wrap a primary operation so a failure yields a sensible substitute — a cached
value, a cheaper source, or a static default — keeping user flows working in a
reduced form. Pair it with the existing `RetryService`: retry transient
failures first, then fall back only once retries are exhausted.

```ts
const rate = await this.fallback.execute(() => this.fx.getLiveRate('USD'), {
  context: 'fx-rate',
  fallbackFn: () => this.cache.getLastKnownRate('USD'),
  // Only fall back on transient/service errors, not on programmer errors.
  shouldFallback: (err) => err instanceof NetworkError,
});
```

On failure the service uses `fallbackFn(error)` if present, otherwise
`fallbackValue`; if neither is configured the original error is rethrown.

## Graceful degradation (`DegradationService`)

Holds an overall `DegradationLevel` (`NORMAL` → `PARTIAL` → `SEVERE`) and a
registry of features tagged by `FeaturePriority`:

| Level     | Enabled features                  |
| --------- | --------------------------------- |
| `NORMAL`  | essential + standard + optional   |
| `PARTIAL` | essential + standard              |
| `SEVERE`  | essential only                    |

```ts
// At startup, declare what's optional.
this.degradation.registerFeature('payments', FeaturePriority.ESSENTIAL);
this.degradation.registerFeature('recommendations', FeaturePriority.OPTIONAL);

// Guard optional work.
if (this.degradation.isFeatureEnabled('recommendations')) {
  await this.recommend(user);
}
// …or assert and let the global exception filter map it to 503:
this.degradation.assertFeatureEnabled('recommendations');
```

The level is normally driven automatically by `IncidentService` (a SEV1
incident forces `SEVERE`, a SEV2 forces `PARTIAL`), but it can also be set
manually for planned maintenance or load-shedding.

## Incident tracking (`IncidentService`)

Operationalises [`INCIDENT_RESPONSE.md`](./INCIDENT_RESPONSE.md): declare
incidents (`INC-YYYY-NNN`), maintain a timeline, transition through the
documented lifecycle, and compute MTTM/MTTR. Declaring/resolving an incident
recomputes the degradation level from the highest open severity. See the
incident-response runbook for the full procedures.

---

## Testing

Every service has a unit spec colocated in `src/common/resilience/*.spec.ts`.
They instantiate the service directly (no Nest `TestingModule` needed) and run
under the standard backend test command:

```bash
cd backend
pnpm run test            # all unit tests
pnpm exec jest common/resilience   # just the resilience suite
```
