# Arbitra Deployment Runbook

This runbook documents how to deploy Arbitra across development, staging, and
production environments. It is written as an operational guide for engineers
performing deployments, validating releases, responding to incidents, and
executing rollbacks safely.

Use this together with:

- [Production Setup](./PRODUCTION_SETUP.md)
- [Deployment Checklist](./DEPLOYMENT_CHECKLIST.md)
- [Backend Docs Index](../README.md)

## 1. Scope

This runbook covers:

- environment setup for development, staging, and production
- infrastructure requirements
- Docker and container image flow
- Kubernetes guidance where clusters are used
- CI/CD pipelines currently defined in GitHub Actions
- step-by-step deployment procedures
- monitoring, alerting, and logging expectations
- rollback procedures
- deployment troubleshooting and safety checks

## 2. Environment Model

### Development

Purpose:

- local feature development
- integration testing against disposable infrastructure
- API/docs validation before opening a PR

Typical stack:

- `backend/docker-compose.yml`
- optional `backend/docker-compose.monitoring.yml`
- local PostgreSQL and Redis
- Stellar testnet / test credentials

Branch/source of truth:

- feature branches
- local worktrees

### Staging

Purpose:

- pre-production verification
- migration validation against staging-like data
- smoke tests for backend, frontend, and contract integrations

Typical stack:

- production-like backend image
- managed PostgreSQL and Redis
- full environment variable set
- external monitoring enabled
- restricted test accounts and staging secrets

Branch/source of truth:

- `develop`

### Production

Purpose:

- live customer traffic
- audited and monitored releases only

Typical stack:

- immutable container images
- managed PostgreSQL and Redis
- backup and restore coverage
- Prometheus/Grafana/Loki/Alertmanager stack or equivalent
- Sentry and on-call alerting enabled

Branch/source of truth:

- `main`
- version tags for release traceability

## 3. Infrastructure Requirements

Minimum production requirements:

- Linux hosts or managed container platform
- Docker runtime or Kubernetes cluster
- PostgreSQL 16+
- Redis 7+
- TLS termination at ingress/load balancer
- secret management for JWT, DB, Stellar, and third-party credentials
- persistent storage for database data and monitoring data

Recommended production topology:

- 2+ application replicas behind a load balancer
- managed PostgreSQL with automated backups and PITR if available
- managed Redis or hardened Redis instance with auth enabled
- separate monitoring stack or managed observability provider
- one environment per isolation boundary: dev, staging, prod

## 4. Environment Setup

### Development Setup

1. Copy environment templates.

```bash
cd backend
cp .env.example .env.development
```

2. Start local infrastructure.

```bash
docker-compose up -d
```

3. Install dependencies and run migrations.

```bash
pnpm install
pnpm run migration:run:safe
pnpm run seed:all
```

4. Start the API.

```bash
pnpm run start:dev
```

5. Verify local health.

```bash
curl http://localhost:5000/health
curl http://localhost:5000/api/docs
```

Development safety notes:

- use Stellar testnet only
- never reuse staging or production secrets locally
- seed only disposable/local demo data

### Staging Setup

1. Provision staging database, Redis, and application runtime.
2. Set environment variables from the approved staging secret store.
3. Deploy the release candidate image.
4. Run database migrations before shifting traffic.
5. Execute smoke tests:
   - `/health`
   - `/api/docs`
   - auth login
   - one critical read endpoint
   - one write endpoint behind staging test data
6. Enable monitoring dashboards and alert routes before test traffic begins.

Staging requirements:

- data must not be production-identifiable unless explicitly approved
- third-party integrations should point to staging/sandbox endpoints
- release validation must include rollback rehearsal for risky migrations

### Production Setup

Production-specific database and seed guidance lives in
[PRODUCTION_SETUP.md](./PRODUCTION_SETUP.md).

Before first production deployment:

1. provision DNS, TLS, database, Redis, and monitoring
2. create production secrets in the platform secret manager
3. verify backup/restore access
4. verify Sentry/alerting integrations
5. verify deployment and rollback operator access
6. verify migration runner access and least-privilege DB role design

## 5. Required Configuration

Core environment variables:

- `NODE_ENV`
- `PORT`
- `DB_HOST`
- `DB_PORT`
- `DB_USERNAME`
- `DB_PASSWORD`
- `DB_NAME`
- `JWT_SECRET`
- `JWT_REFRESH_SECRET`
- `REDIS_HOST` or `REDIS_URL`
- `REDIS_PASSWORD` or `REDIS_TOKEN`

Blockchain-related variables:

- `STELLAR_NETWORK`
- `SOROBAN_RPC_URL`
- `STELLAR_ADMIN_SECRET_KEY`
- contract IDs required by the backend services

Operational variables:

- `SENTRY_DSN`
- `API_BASE_URL`
- `FRONTEND_URL`
- `CORS_ORIGINS`
- rate-limit settings
- request-size settings

Secret handling rules:

- never commit environment files with live secrets
- rotate secrets on operator departure or incident response
- use different secrets per environment

## 6. Docker Setup

Production compose reference files:

- `backend/docker-compose.production.yml`
- `backend/docker-compose.monitoring.yml`

Container expectations:

- application image is built once per revision and promoted across environments
- images are tagged with commit SHA and optionally release tag
- production should avoid mutable-only tags such as `latest` as the sole deploy
  reference

Example backend image build:

```bash
docker build -f backend/Dockerfile.production -t ghcr.io/<org>/arbitra/backend:<sha> backend
```

Example production compose deploy:

```bash
cd backend
DOCKER_IMAGE=ghcr.io/<org>/arbitra/backend:<sha> \
docker compose -f docker-compose.production.yml up -d
```

Docker operational notes:

- ensure `curl` is present if health checks depend on it
- pin image versions for Postgres and Redis
- mount persistent volumes for database and monitoring state
- do not run demo seeding in production unless explicitly required

## 7. Kubernetes Guidance

Kubernetes manifests are not present in this repository today, but if Arbitra is
deployed to Kubernetes, use the following deployment model:

- `Deployment` for backend replicas
- `Service` for internal exposure
- `Ingress` or gateway for external TLS routing
- `ConfigMap` for non-secret settings
- `Secret` for credentials and tokens
- `HorizontalPodAutoscaler` for traffic-based scaling
- `PodDisruptionBudget` for controlled rollouts
- `Job` or `CronJob` for migrations and scheduled maintenance tasks

Recommended rollout pattern:

1. pull immutable image by SHA
2. run migration `Job`
3. deploy new backend replica set
4. wait for readiness checks to pass
5. verify health and smoke tests
6. complete rollout

Kubernetes safety rules:

- migrations must be serialized
- readiness and liveness probes must point to healthy endpoints
- production rollouts should use `maxUnavailable=0` where practical

## 8. CI/CD Pipeline

Current GitHub Actions workflows:

- `.github/workflows/backend-ci-cd.yml`
- `.github/workflows/frontend-ci-cd.yml`
- `.github/workflows/contract-ci-cd.yml`

### Backend Pipeline

The backend workflow currently performs:

- dependency installation
- audit scan
- ESLint
- Prettier check
- TypeScript check
- unit tests and coverage
- PostgreSQL-backed E2E tests
- migration rollback verification
- Trivy security scan

Deployment implication:

- pushes to `develop` or `main` are the expected release branches
- production deployment should only happen after all required jobs pass

### Frontend Pipeline

The frontend workflow currently performs:

- install
- lint
- format checks
- optional tests when installed
- build
- placeholder production deploy step

Action required for production:

- replace placeholder deploy command with the chosen platform deploy command
- ensure environment promotion rules match backend release rules

### Contract Pipeline

The contract workflow performs:

- release build
- format check
- clippy
- `cargo test --all`

Release rule:

- do not deploy contract-dependent backend changes unless contract CI is green

## 9. Deployment Process

### Pre-Deployment Checks

Complete the checklist in [DEPLOYMENT_CHECKLIST.md](./DEPLOYMENT_CHECKLIST.md).

Minimum pre-deploy gates:

- target branch is approved and merged per release policy
- CI is green
- migrations reviewed
- secrets verified for target environment
- rollback plan confirmed
- monitoring dashboards open
- on-call aware for production deploys

### Staging Deployment Procedure

1. Confirm `develop` is stable and approved for staging.
2. Build or promote the release image.
3. Apply configuration changes and secrets.
4. Run migrations.
5. Deploy backend/frontend/contract-dependent components.
6. Verify:
   - `/health`
   - `/health/detailed`
   - `/api/docs`
   - one auth flow
   - one read path
   - one write path
7. Review logs, metrics, and alerts for 15 to 30 minutes.

### Production Deployment Procedure

1. Freeze non-essential changes during the release window.
2. Confirm production checklist sign-off.
3. Announce deployment start in the team channel/on-call channel.
4. Create a fresh database backup or confirm managed backup recency.
5. Promote the tested image revision from staging.
6. Run database migrations.
7. Deploy the application using rolling or blue/green strategy.
8. Execute post-deployment smoke tests.
9. Monitor:
   - error rates
   - latency
   - health checks
   - DB saturation
   - Redis saturation
   - job failures
10. Announce deployment completion only after the observation window passes.

### Blue/Green or Rolling Strategy

Use one of:

- blue/green when infrastructure supports traffic switching cleanly
- rolling update when Kubernetes or the platform handles replica health gating

Never:

- run schema-breaking migrations without a rollback plan
- switch traffic before health and smoke checks pass

## 10. Monitoring and Alerting

Monitoring assets in the repository:

- `backend/docker-compose.monitoring.yml`
- `backend/monitoring/prometheus/prometheus.yml`
- `backend/monitoring/prometheus/alerts.yml`
- `backend/monitoring/promtail/promtail-config.yml`

Minimum signals to watch during and after deploy:

- application health endpoint success rate
- request latency and throughput
- 5xx rate
- database connection pool usage
- Redis availability
- queue backlog and failed jobs
- container restarts
- host CPU and memory saturation

Alerting expectations:

- production alerts must route to on-call
- deployment alerts should distinguish transient startup failures from
  sustained incidents
- alert thresholds should be reviewed after every major release change

## 11. Logging

Logging sources:

- application logs from NestJS/Winston
- reverse proxy/load balancer logs
- database logs for slow queries and failures
- container runtime logs

Logging requirements:

- structured logs in all non-local environments
- request correlation via request IDs
- retention policy defined per environment
- sensitive data redacted before export

Operational commands:

```bash
docker logs -f arbitra-backend-production
docker compose -f backend/docker-compose.monitoring.yml logs -f prometheus grafana loki promtail
```

## 12. Rollback Procedures

Rollback choice depends on failure class.

### Application-Only Rollback

Use when:

- the code is faulty
- migrations are backward compatible
- the previous image is still safe to run

Steps:

1. redeploy previous image/tag
2. verify health and smoke checks
3. keep incident notes for follow-up

### Configuration Rollback

Use when:

- a secret/config change broke startup or integration

Steps:

1. restore previous environment variable set
2. restart application
3. verify health and alert recovery

### Database Rollback

Use when:

- a migration introduced irreversible application failure
- data integrity is at risk

Steps:

1. stop further writes if possible
2. revert last migration only if the migration was written to support safe
   reversal
3. if needed, restore from backup using approved restore procedure
4. validate schema and critical records
5. redeploy compatible application version

Production rule:

- database restore is a high-risk operation and requires incident command or
  designated approval

## 13. Troubleshooting

### Deployment Fails Before Startup

Check:

- image tag correctness
- secret injection
- missing env vars
- migration job logs
- port collisions

### Health Check Fails

Check:

- `/health` response locally in container
- database reachability
- Redis reachability
- application boot logs
- incorrect port mapping

### Migration Failure

Check:

- migration order
- DB permissions
- locks on target tables
- incompatible old application instances still serving traffic

### Elevated 5xx After Deploy

Check:

- recent config changes
- third-party dependency failures
- Sentry traces and exception grouping
- load balancer and ingress health

### Monitoring Stack Missing Data

Check:

- Prometheus target discovery
- scrape credentials/network access
- Promtail mount paths
- Grafana datasource provisioning

## 14. Post-Deployment Checks

After every staging or production deploy:

- verify health endpoints
- review logs for repeated exceptions
- confirm alert noise is normal
- verify one critical business flow end to end
- confirm no stuck migrations or failed background jobs
- document anomalies before closing the deployment window

## 15. Safety Rules

Always:

- deploy from reviewed commits only
- deploy immutable artifacts
- verify backups before risky changes
- keep rollback artifacts available
- document incidents and mitigations

Never:

- deploy directly from unreviewed local changes
- rotate secrets during a high-risk rollout without a fallback plan
- run destructive DB commands without explicit approval
