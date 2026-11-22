# Multi-region Deployment

## Scope

The API runs actively in one region with a warm standby in a second region. Terraform in `infra/terraform` creates the network, API service, database, cache and DNS records for both regions.

## Traffic routing

Route53 has two failover records for the API hostname. Both are alias records to regional application load balancers. Route53 health checks request `/health` over HTTPS every 30 seconds and require three failures before marking a region down. The primary record has `PRIMARY` failover and the secondary record has `SECONDARY` failover. Each load balancer also checks `/health` every 30 seconds.

During a graceful shutdown the process flips shared shutdown state before closing the server. Both health endpoints then return HTTP 503 with status `error`, so Route53 and the load balancer stop sending traffic before in-flight requests are drained.

## Database replication

The primary region runs Postgres with Multi AZ, which covers instance and availability zone failure. The secondary region runs a read replica from the primary using `replicate_source_db`. Replication lag is the main consistency tradeoff. Writes remain in the primary region, and promotion of the secondary is a deliberate operator action.

Cross region asynchronous replication means a failover can lose the most recent writes. Applications that need read after write consistency should route those reads to the primary until promotion is complete.

## Redis and Sentinel

Each region runs two Redis data nodes and three Sentinels. Sentinels use a quorum of two, detect a down master after 5 seconds and set a 30 second failover timeout. API tasks receive `REDIS_MODE=sentinel`, `REDIS_SENTINELS` and `REDIS_SENTINEL_MASTER_NAME` instead of a direct Redis host. See `REDIS_SENTINEL.md` for configuration and monitoring details.

## Cross region Stellar calls

Stellar contract writes are signed in the primary region only. The standby region can read Horizon state and serve cached queries, but it must not submit competing transactions. After a regional failover, confirm the signing key is available in the new primary region before enabling writes.

## Tradeoffs

| Choice                        | Benefit                                           | Cost                                     |
| ----------------------------- | ------------------------------------------------- | ---------------------------------------- |
| Active and warm standby       | Fast recovery, no idle write conflicts            | Standby capacity is paid but mostly idle |
| Asynchronous database replica | Low write latency in the primary                  | Possible write loss on failover          |
| Route53 failover DNS          | Simple routing, no always on cross region latency | DNS propagation and health check delay   |
| Redis Sentinel per region     | Automatic local failover under 30 seconds         | No cross region cache replication        |

## Deployment tests

Run `pnpm validate:terraform` from the repository root. It verifies two regions, database replication, Route53 failover records, health checks, Redis node counts, Sentinel quorum and the API Sentinel environment contract. With an initialised Terraform directory it also runs native formatting check and validate.

## Manual failover runbook

1. Confirm the primary health check has failed and traffic has shifted to the secondary record.
2. Stop writes at the application boundary.
3. Promote the secondary read replica and update the application database host configuration.
4. Confirm Sentinel reports a healthy master in the secondary region.
5. Re-enable writes, then verify `/health` returns 200 for both API tasks.
6. Record measured detection and recovery time. The target is under 30 seconds for Redis failover and under 5 minutes for regional traffic failover.

Live failover and DNS propagation cannot be executed by the offline test harness. They require cloud credentials and must be performed in a maintenance window.
