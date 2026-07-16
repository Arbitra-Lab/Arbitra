# Caching in Arbitra

This directory contains the documentation for the caching architecture, operations, and development guidelines for the Arbitra backend.

## 📖 Primary Documentation

> [!IMPORTANT]
> All developers should read the **[Caching Strategy & Architecture](./CACHING_STRATEGY.md)** first. It outlines the overall design, key conventions, and best practices.

## 🏗 Core Abstractions

- **[CacheService](file:///home/abujulaybeeb/Documents/Drips%206/arbitra/backend/src/common/cache/cache.service.ts)**: The central service for all cache operations.
- **[@Cached Decorator](file:///home/abujulaybeeb/Documents/Drips%206/arbitra/backend/src/common/cache/cached.decorator.ts)**: A high-level decorator for easy method-level caching.
- **[Monitoring Controller](file:///home/abujulaybeeb/Documents/Drips%206/arbitra/backend/src/modules/monitoring/monitoring.controller.ts)**: Exposes real-time cache statistics at `/api/cache/stats`.

## 📚 Deep Dives

| Guide                                          | Description                                                          |
| :--------------------------------------------- | :------------------------------------------------------------------- |
| **[Invalidation Patterns](./invalidation.md)** | Detailed look at the 5 invalidation strategies with code examples.   |
| **[Monitoring & SLOs](./monitoring.md)**       | Metric definitions, alert thresholds, and incident playbooks.        |
| **[Troubleshooting](./troubleshooting.md)**    | Common issues like stale data, high miss rates, and memory pressure. |
| **[Code Examples](./examples.md)**             | Reference implementations for standard use cases.                    |

## 🚀 Getting Started

To add caching to a new service:

1. Identify the domain and define a key prefix in `cache.constants.ts`.
2. Inject `CacheService` into your class.
3. Use the `@Cached` decorator on read methods.
4. Call `cacheService.invalidate()` on write methods that mutate the data.
5. Verify the cache hit rate via the monitoring endpoint.
