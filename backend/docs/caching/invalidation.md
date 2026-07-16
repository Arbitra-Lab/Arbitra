# Cache Invalidation Patterns

This guide documents the invalidation patterns used in Arbitra backend services.

## 1) Time-based Expiration

Use a TTL so entries automatically expire without explicit invalidation.

```ts
await this.cacheService.set(cacheKey, value, 300_000);
```

Use for data that can tolerate slight staleness and changes frequently.

## 2) Event-based Invalidation

Invalidate affected keys immediately after a write/mutation event.

```ts
await this.userRepository.update(id, data);
await this.cacheService.invalidate(`user:${id}`);
```

Use when correctness requires fresh reads right after updates.

## 3) Dependency-based Invalidation

Store cache entries with dependency tags and invalidate by tag.

```ts
await this.cacheService.set(`user:${id}:with-role`, payload, 3_600_000, [
  'user:*',
  'role:*',
]);

await this.cacheService.invalidate('role:*');
```

Use for fan-out relationships where one change affects many cached keys.

## 4) Manual Invalidation

Use administrative or operational endpoints/scripts to purge stale domains.

```ts
await this.cacheService.invalidateAll();
```

Use sparingly during incidents, migrations, or emergency remediation.

## 5) Cascade Invalidation

Invalidate related key spaces together when a domain entity mutates.

```ts
await this.cacheService.invalidatePropertyDomainCaches(propertyId);
```

This clears multiple prefixes (`property`, `properties:list`, `search`, `suggest`) and prevents partial staleness.

## Pattern Selection Matrix

| Scenario               | Pattern                        |
| ---------------------- | ------------------------------ |
| Public list pages      | Time-based + cascade on writes |
| Entity detail reads    | Event-based                    |
| Join/aggregation views | Dependency-based               |
| Incident recovery      | Manual                         |
| Multi-domain mutation  | Cascade                        |

## Failure Handling

- If invalidation fails, log with entity id and retry asynchronously.
- Keep TTLs finite to provide eventual correctness fallback.
- Prefer idempotent invalidation operations (safe to repeat).
