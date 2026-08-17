# Analytics Incremental Rollups

Landlord dashboard inquiry aggregates are served from materialized daily
rollups instead of a full scan of `property_inquiries`.

## Schema

`analytics_inquiry_rollups_daily`

| column                 | type      | note                                |
| ---------------------- | --------- | ----------------------------------- |
| `id`                   | uuid PK   | `gen_random_uuid()`                 |
| `owner_id`             | uuid      | inquiry `to_user_id`                |
| `property_id`          | uuid      |                                     |
| `bucket_date`          | date      | UTC day of the inquiry `created_at` |
| `inquiry_count`        | int       |                                     |
| `viewed_inquiry_count` | int       | rows with status `viewed`           |
| `updated_at`           | timestamp |                                     |

Indexes: unique `(owner_id, property_id, bucket_date)`, plus
`(owner_id, bucket_date)` for the serving read.

`analytics_rollup_watermarks`: `name` (PK, job id, e.g. `inquiry_daily`),
`watermark` (max source `updated_at` folded so far), `last_run_at`.

## Job

`AnalyticsRollupService.runIncrementalRollup()` runs hourly (`@Cron`, skipped
when `NODE_ENV=test`).

1. Read the watermark. `null` means the job never ran, so the first pass is a
   full backfill over every inquiry.
2. Otherwise select only inquiries with `updated_at > watermark - 5 min`. The
   overlap absorbs clock skew and commits in flight during the last run.
3. Map changed rows to `(owner_id, property_id, UTC day)` keys and dedup.
4. Skip keys older than `ANALYTICS_ROLLUP_LOOKBACK_DAYS` (default 7) and count
   them as `skippedStaleBuckets`. The backfill pass folds every day.
5. Recompute each remaining bucket from raw over `[dayStart, nextDayStart)`.
   Recompute-from-raw (not delta arithmetic) is what makes reruns idempotent
   and the watermark overlap safe.
6. Advance the watermark to `max(updated_at)` over the processed rows.

## Serving

`getLandlordDashboard(ownerId, days, source)` uses the rollup path when
`(source === 'rollup' || source === 'auto') && watermark !== null`; otherwise it
recomputes from raw. `source='rollup'` with no watermark falls back to raw, so
the endpoint keeps working before the first job run. Properties are always read
raw — view/favorite counters are current-state, not time-series.

The rollup path tops up with a tail query for inquiries with
`created_at > watermark`, so rows newer than the last job run are still exact.

The response carries `meta.dataSource` (`rollup` | `raw`) and `meta.watermark`.

## Staleness bound

Only late `pending -> viewed` status flips on rows already folded can lag, and
by at most one cron interval (1 hour). Counts of new inquiries are always exact
because of the tail top-up.
