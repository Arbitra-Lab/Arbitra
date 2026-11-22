# Secrets Rotation Policy

**Project:** Arbitra Platform  
**Scope:** Production and staging secrets  
**Owner:** Platform Security / DevOps  
**Last Updated:** 2026-04

## Policy

All sensitive runtime secrets are rotated automatically every **90 days** (or immediately on
suspected compromise). Rotation is managed through **AWS Secrets Manager** rotation schedules
with service-specific rotation functions/lambdas where required.

## In-scope secrets

| Secret | Rotation cadence | Mechanism | Notes |
|---|---:|---|---|
| Database password (`DB_PASSWORD`, `DATABASE_URL` credentials) | 90 days | AWS Secrets Manager RDS/Postgres rotation lambda | Use multi-user rotation; app reads synced Kubernetes secret. |
| JWT secrets (`JWT_SECRET`, `JWT_REFRESH_SECRET`) | 90 days | AWS Secrets Manager rotation function | Dual-secret overlap window during rollout; remove old secret after verification. |
| API keys / third-party credentials (`SENTRY_DSN`, AWS keys, provider keys) | 90 days | AWS Secrets Manager rotation/manual-approved automation per provider | Revoke old key after verification; keep audit trail. |
| Stellar/admin keys | 90 days or on incident | AWS Secrets Manager + controlled operational rotation | Requires change-control and blockchain operation validation. |

## Automatic delivery to workloads

- Kubernetes workloads consume secrets via External Secrets Operator (`backend/k8s/external-secrets/`).
- `ExternalSecret.spec.refreshInterval: 1h` pulls rotated values from AWS Secrets Manager into
  `arbitra-backend-secrets`.
- `deployment.yaml` includes a `reloader.stakater.com/auto: "true"` annotation so Stakater
  Reloader triggers a zero-downtime rolling restart when the synced secret changes. This avoids
  manual intervention while preserving availability through rolling updates (`maxUnavailable: 0`)
  and PodDisruptionBudget.
- No plaintext secret values are committed to git or stored in manifests.

## Zero-downtime requirements

- Database credential rotation uses alternating users/versions so old credentials remain valid
  during rollout.
- JWT rotation uses overlap: accept previous + current signing secrets during rollout window,
  then remove previous after all pods restart.
- Deployments have rolling update strategy (`maxUnavailable: 0`) and PDB to preserve availability.
- HPA min replicas >=2 ensures at least one healthy pod during rollout.

## Audit logging

Every rotation event must be auditable:

- AWS Secrets Manager/CloudTrail records rotation invocation, actor, source IP, timestamp, secret
  ARN/version, and outcome.
- ExternalSecret sync and rollout/restart events are captured by Kubernetes audit logs and
  deployment events.
- Incident/emergency rotations create an entry in the security audit trail and incident ticket.

Minimum audit fields: `timestamp`, `secret_id`, `secret_version`, `actor`, `action`,
`result`, `environment`, `ticket_or_incident`.

## Manual intervention / emergency rotation

1. Trigger immediate rotation in AWS Secrets Manager (or create new secret version).
2. Verify ExternalSecret sync status: `kubectl describe externalsecret arbitra-backend-secrets -n production`.
3. Confirm rollout: `kubectl rollout status deployment/arbitra-backend -n production`.
4. Validate `/health`, auth, DB connectivity, and critical flows.
5. Revoke superseded credentials and record audit event.

## Verification

- Quarterly: test one non-production rotation end-to-end.
- Monthly: review CloudTrail/Secrets Manager rotation logs for failures.
- Alerts: notify on ExternalSecret sync failure or rotation lambda failure.
