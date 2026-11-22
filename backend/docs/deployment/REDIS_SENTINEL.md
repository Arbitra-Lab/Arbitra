# Redis Sentinel

## Topology

Each region runs two Redis data nodes, one primary and one replica, and three Sentinels. Sentinels monitor the master name `arbitra-primary` with a quorum of two. They mark a master down after 5 seconds and allow 30 seconds for failover.

## Application configuration

Set `REDIS_MODE=sentinel` to bypass the Upstash branch. The connection factory reads:

- `REDIS_SENTINELS`: comma separated `host:port` entries, for example `10.0.1.5:26379,10.0.2.5:26379,10.0.3.5:26379`.
- `REDIS_SENTINEL_MASTER_NAME`: defaults to `mymaster`, set to `arbitra-primary` in Terraform.
- `REDIS_SENTINEL_PASSWORD`: optional password for the Sentinel connection.
- `REDIS_PASSWORD`: optional password for the Redis data nodes.

Client profiles are explicit. Cache and lock clients use `maxRetriesPerRequest: 3` with ready checks enabled. Bull uses `maxRetriesPerRequest: null` and ready checks disabled because queued jobs must survive transient disconnects. All clients share one factory, which closes them during graceful shutdown.

To run the topology locally, use `docker compose -f docker-compose.sentinel.yml up`. It starts one master, one replica and three Sentinels.

## Failover verification

1. Start the compose stack and note the current master with `redis-cli -p 26379 SENTINEL get-master-addr-by-name arbitra-primary`.
2. Stop the master with `docker compose -f docker-compose.sentinel.yml stop redis-master`.
3. Poll `SENTINEL get-master-addr-by-name` once per second until the address changes.
4. Record the elapsed time. The target is under 30 seconds.
5. Restart the old master and confirm it rejoins as a replica.

The offline contract checks in `infra/terraform/tests/validate-deployment.mjs` verify the topology, quorum and timeouts. They do not execute a live failover.

## Monitoring

Prometheus alerts live in `monitoring/prometheus/redis-sentinel-alerts.yml`. They cover a down Redis node, a broken replica link and loss of Sentinel quorum. Export metrics with `redis_exporter` pointed at each node and each Sentinel. Alert evaluation runs every 15 seconds so a 30 second failover is observable.
