# Rate Limiting and Throttling

Houston Housing uses NestJS Throttler to protect API resources from abuse, smooth traffic spikes, and preserve predictable latency for normal users.

---

## Rate Limiting Strategy

Primary strategy:

- Apply baseline request limits to all API endpoints.
- Apply stricter limits to abuse-prone endpoints (login, registration, password reset).
- Use identity-aware keys where possible (user ID for authenticated requests, IP for unauthenticated requests).
- Return explicit rate-limit headers and `429` responses to support safe client retries.

Default limits:

| Endpoint group                   | Window     | Max requests | Scope          |
| -------------------------------- | ---------- | ------------ | -------------- |
| All endpoints                    | 1 minute   | 100          | Global default |
| `POST /api/auth/login`           | 15 minutes | 10           | Per IP         |
| `POST /api/auth/register`        | 1 hour     | 5            | Per IP         |
| `POST /api/auth/forgot-password` | 1 hour     | 3            | Per IP         |
| `POST /api/payments`             | 1 minute   | 20           | Per user       |
| `POST /api/auth/stellar/*`       | 1 minute   | 30           | Per IP         |
| `GET /api/*` (read operations)   | 1 minute   | 200          | Per user       |

---

## Throttling Policies

Apply policy tiers based on endpoint risk:

- Authentication and recovery: strict limits, longer windows.
- Write-heavy financial operations: strict short-window limits.
- Read operations: higher limits with fair-use monitoring.
- Admin/internal endpoints: separate limits and stronger audit logging.

Escalation policy for repeated abuse:

1. Temporary strict throttling on offender key.
2. Short-term blocklist entry for sustained automated abuse.
3. Manual review and permanent mitigation if abuse persists.

---

## Rate Limit Configuration

Example NestJS throttler configuration:

```typescript
ThrottlerModule.forRoot([
  {
    name: 'global',
    ttl: 60_000,
    limit: 100,
  },
  {
    name: 'auth',
    ttl: 15 * 60_000,
    limit: 10,
  },
]);
```

Configuration standards:

- Keep limits in configuration, not hardcoded in controllers.
- Use environment-specific values for staging vs production.
- Review and adjust thresholds after incident reviews or traffic changes.

---

## Rate Limit Headers

Clients should receive and honor these headers:

```
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 87
X-RateLimit-Reset: 1712053860
Retry-After: 23
```

`Retry-After` is present only when a request is throttled.

| Header                  | Description                                    |
| ----------------------- | ---------------------------------------------- |
| `X-RateLimit-Limit`     | Maximum requests allowed in the current window |
| `X-RateLimit-Remaining` | Requests remaining in the current window       |
| `X-RateLimit-Reset`     | Unix timestamp when the window resets          |
| `Retry-After`           | Seconds to wait before retrying (on `429`)     |

---

## Algorithms

The platform primarily uses a fixed-window throttling model from NestJS Throttler.

When traffic patterns require smoother enforcement, consider:

- Sliding window for fairer burst control.
- Token bucket for controlled bursts with sustained rate caps.

Algorithm selection criteria:

- Endpoint sensitivity (auth/payment vs read-only).
- User experience impact during bursts.
- Operational complexity and observability needs.

---

## Client Handling Guidelines

Clients must handle `429 Too Many Requests` gracefully:

- Read and respect `Retry-After`.
- Retry using bounded exponential backoff.
- Avoid synchronized retries (add jitter where possible).
- Surface useful user feedback when retries are delayed.

Example:

```typescript
async function fetchWithRetry(
  url: string,
  options: RequestInit,
  maxRetries = 3,
) {
  for (let attempt = 0; attempt < maxRetries; attempt += 1) {
    const response = await fetch(url, options);
    if (response.status !== 429) return response;

    const retryAfter = Number(response.headers.get('Retry-After') ?? '5');
    const jitterMs = Math.floor(Math.random() * 250);
    const delayMs = retryAfter * 1000 * Math.pow(2, attempt) + jitterMs;
    await new Promise((resolve) => setTimeout(resolve, delayMs));
  }

  throw new Error('Rate limit retry budget exhausted');
}
```

---

## Monitoring and Alerting

Monitor rate-limiting health with:

- `429` count and percentage by endpoint.
- Top offending keys (IP/user).
- Authentication endpoint throttle frequency.
- Latency and error trends before and after limit changes.

Operational procedure:

1. Track baseline `429` rates by endpoint.
2. Alert on abnormal spikes and sustained abuse patterns.
3. Correlate with deployment timeline and traffic sources.
4. Tune limits using observed legitimate usage and abuse metrics.

---

## Bypass Procedures

Bypass is allowed only for controlled operational scenarios:

- Internal health checks and trusted infrastructure paths.
- Temporary incident mitigation approved by backend lead/on-call owner.

Bypass controls:

- Time-box every bypass with explicit expiry.
- Log who approved it and why.
- Audit all bypassed requests.
- Remove bypass immediately after incident resolution.

---

## Testing Rate Limits

Required test coverage:

- Unit tests for throttler guards/interceptors where customized.
- Integration tests confirming `429` behavior and headers.
- E2E checks for high-risk endpoints (auth, payments).
- Regression checks when limits are modified.

Practical test scenarios:

- Burst requests above threshold in same window.
- Verify `Retry-After` and remaining counts.
- Confirm reset behavior after window expiry.
- Validate per-user vs per-IP behavior.

---

## Troubleshooting

When users report unexpected throttling:

1. Check recent `429` metrics for affected endpoint and key.
2. Confirm whether traffic is user-driven, bot traffic, or retry storms.
3. Verify current limit values and environment overrides.
4. Review recent deployment/config changes.
5. Adjust limit tier or client retry behavior as needed.

Common causes:

- Client retry loops without backoff
- Shared NAT IP traffic concentration
- Endpoint misuse from automated jobs
- Overly strict limits after product traffic growth

---

## API Error Example

```json
{
  "statusCode": 429,
  "error": "RATE_LIMIT_EXCEEDED",
  "message": "Too many requests. Please wait 23 seconds before retrying.",
  "timestamp": "2025-04-01T09:30:00Z",
  "path": "/api/auth/login"
}
```

---

## Swagger Documentation Requirement

Rate-limited endpoints should document `429` response headers:

```typescript
@ApiResponse({
  status: 429,
  description: 'Too many requests',
  headers: {
    'Retry-After': {
      description: 'Seconds until the rate limit window resets',
      schema: { type: 'integer', example: 30 },
    },
  },
})
```

---

## Rate Limiting Checklist

- [ ] Endpoint groups mapped to appropriate limit tiers.
- [ ] `429` responses include correct headers.
- [ ] Client retry guidance documented and validated.
- [ ] Monitoring and alert thresholds are configured.
- [ ] Abuse escalation path is defined and tested.
- [ ] Bypass procedures are time-boxed and audited.
- [ ] Tests cover window behavior, headers, and reset semantics.
