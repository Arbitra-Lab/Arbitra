# Arbitra Backend Kubernetes Manifests

These manifests cover baseline production deployment concerns for the backend API.

## Apply order

```bash
kubectl apply -f backend/k8s/configmap.yaml
kubectl apply -f backend/k8s/rbac.yaml
kubectl apply -f backend/k8s/resourcequota.yaml
kubectl apply -f backend/k8s/limitrange.yaml
kubectl apply -f backend/k8s/deployment.yaml
kubectl apply -f backend/k8s/service.yaml
kubectl apply -f backend/k8s/hpa.yaml
kubectl apply -f backend/k8s/pdb.yaml
kubectl apply -f backend/k8s/ingress.yaml
kubectl apply -f backend/k8s/cert-manager/cluster-issuer.yaml
kubectl apply -f backend/k8s/cert-manager/certificate.yaml
kubectl apply -f backend/k8s/cert-manager/prometheusrule-cert-expiry.yaml
kubectl apply -f backend/k8s/external-secrets/secret-store.yaml
kubectl apply -f backend/k8s/external-secrets/backend-external-secret.yaml
kubectl apply -f backend/k8s/backup-cronjob.yaml
```

## Resource policy

- Deployment requests: `50m` CPU / `128Mi` memory.
- Deployment limits: `1000m` CPU / `512Mi` memory.
- HPA: min 2, max 10 replicas, CPU 70% and memory 80% utilization targets.
- PDB: `minAvailable: 1` to keep service available during voluntary disruptions/rolling updates.
- ResourceQuota/LimitRange enforce namespace-level guardrails and defaults.

## TLS / cert-manager

`cert-manager` manages `arbitra-api-tls` for `api.arbitra.app` using Let's Encrypt.
Certificates renew automatically 30 days before expiry (`renewBefore: 720h`). Prometheus alerts
fire on expiry risk and renewal failure. See `backend/docs/SSL_TLS_CERTIFICATE_MANAGEMENT.md`.

## Secrets rotation

Secrets are sourced from AWS Secrets Manager through External Secrets Operator.
`refreshInterval: 1h` syncs rotated values into `arbitra-backend-secrets`. Rotation is automated
by AWS Secrets Manager rotation schedules/lambdas per secret type; rollout is zero-downtime by
triggering a rolling restart (Reloader or deployment annotation update) after sync. See
`backend/docs/security/SECRETS_ROTATION_POLICY.md`.

## Backups / DR

`arbitra-db-backup` CronJob runs daily at 02:00 UTC, uploads encrypted backups to S3, replicates to
a separate region bucket, and retains 30 days. See `backend/docs/deployment/BACKUP_AND_RECOVERY.md`
and `backend/docs/deployment/DISASTER_RECOVERY_PLAN.md`.
