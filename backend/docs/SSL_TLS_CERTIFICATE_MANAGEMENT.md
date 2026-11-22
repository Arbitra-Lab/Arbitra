# SSL/TLS Certificate Management

This document covers how Arbitra obtains, installs, and automatically renews
SSL/TLS certificates using [Let's Encrypt](https://letsencrypt.org) and
[Certbot](https://certbot.eff.org).

---

## Overview

| Component                         | Role                                                 |
| --------------------------------- | ---------------------------------------------------- |
| **Certbot**                       | Obtains and renews certificates from Let's Encrypt   |
| **nginx**                         | Terminates TLS and serves the ACME HTTP-01 challenge |
| **ssl-setup.sh**                  | One-time certificate provisioning script             |
| **ssl-renew.sh**                  | Manual or cron-triggered renewal script              |
| **docker-compose.production.yml** | Wires nginx + certbot together with shared volumes   |

Certificates are stored in `/etc/letsencrypt/live/<domain>/` by Certbot and
copied to the paths nginx expects:

- **Certificate chain**: `/etc/ssl/certs/arbitra.crt`
- **Private key**: `/etc/ssl/private/arbitra.key`

---

## First-Time Setup

### Prerequisites

- Domain `api.arbitra.app` (or your domain) must resolve to the server's public IP.
- Ports **80** and **443** must be open in your firewall/security group.
- Docker and Docker Compose must be installed.

### Step 1 — Start nginx (HTTP only)

Before obtaining a certificate, nginx must be reachable on port 80 to serve
the ACME challenge. Start only the nginx and backend services:

```bash
cd backend
docker compose -f docker-compose.production.yml up -d nginx backend
```

### Step 2 — Obtain the certificate

Run the setup script as root (or with `sudo`):

```bash
sudo bash backend/scripts/ssl-setup.sh api.arbitra.app admin@arbitra.app
```

The script will:

1. Install Certbot if not present.
2. Obtain a certificate via the HTTP-01 webroot challenge.
3. Copy the certificate and key to `/etc/ssl/certs/arbitra.crt` and
   `/etc/ssl/private/arbitra.key`.
4. Install a daily cron job at `/etc/cron.d/arbitra-ssl-renew`.

### Step 3 — Reload nginx with TLS enabled

```bash
docker exec arbitra-nginx nginx -s reload
```

### Step 4 — Start remaining services

```bash
docker compose -f docker-compose.production.yml up -d
```

---

## Docker Compose Setup

`docker-compose.production.yml` includes two SSL-related services:

### nginx

```yaml
nginx:
  image: nginx:1.27-alpine
  volumes:
    - ./nginx/nginx.conf:/etc/nginx/conf.d/default.conf:ro
    - ssl-certs:/etc/ssl/certs # certificate chain
    - ssl-private:/etc/ssl/private # private key
    - certbot-webroot:/var/www/certbot # ACME challenge files
```

### certbot

```yaml
certbot:
  image: certbot/certbot:latest
  volumes:
    - letsencrypt:/etc/letsencrypt # Certbot's certificate store
    - certbot-webroot:/var/www/certbot # shared with nginx
```

The certbot container runs a renewal loop that checks every 12 hours and
renews certificates that expire within 30 days.

---

## Certificate Renewal

### Kubernetes (cert-manager) — preferred

Kubernetes manifests live in `backend/k8s/cert-manager/`:

- `cluster-issuer.yaml`: Let's Encrypt production and staging ClusterIssuers.
- `certificate.yaml`: `arbitra-api-tls` for `api.arbitra.app`, `duration: 2160h` (90 days),
  `renewBefore: 720h` (30 days before expiry), `privateKey.rotationPolicy: Always`.
- `prometheusrule-cert-expiry.yaml`: alerts when expiry is <30 days or certificate is not ready.

`backend/k8s/ingress.yaml` references `secretName: arbitra-api-tls` and is annotated with
`cert-manager.io/cluster-issuer: letsencrypt-prod`.

**Zero-downtime renewal:** cert-manager updates the TLS Secret in place before expiry. The ingress
controller picks up the renewed secret; no pod restart is required. During renewal, existing
connections continue using the currently loaded certificate until the controller reloads.

### Automatic (Docker)

The `certbot` service in `docker-compose.production.yml` handles renewal
automatically. No manual action is required.

### Automatic (bare-metal / cron)

`ssl-setup.sh` installs a cron job at `/etc/cron.d/arbitra-ssl-renew` that
runs `certbot renew` daily at 03:00 and reloads nginx on success.

## Certificate Renewal Alerts

Prometheus/cert-manager alerts:

- `ArbitraTLSCertificateExpiringSoon` (warning): fires when `arbitra-api-tls` expires in <30 days for 1h.
  This indicates automatic renewal did not complete as expected.
- `ArbitraTLSCertificateRenewalFailed` (critical): fires when cert-manager reports `Ready=False` for 15m.

Alert rule source: `backend/k8s/cert-manager/prometheusrule-cert-expiry.yaml`.

### Manual intervention

If renewal fails:

1. Inspect cert-manager resources:
   ```bash
   kubectl describe certificate arbitra-api-tls -n production
   kubectl get certificaterequest,order,challenge -n production
   kubectl describe challenge -n production <challenge-name>
   ```
2. Check issuer and account secret:
   ```bash
   kubectl describe clusterissuer letsencrypt-prod
   kubectl get secret letsencrypt-prod-account-key -n cert-manager
   ```
3. Verify DNS/HTTP-01 reachability for `api.arbitra.app` on port 80.
4. Check cert-manager logs:
   ```bash
   kubectl logs -n cert-manager deploy/cert-manager --tail=200
   ```
5. For emergency/manual issuance (break-glass), run `backend/scripts/ssl-setup.sh` against the
   ingress/load balancer endpoint and update the `arbitra-api-tls` secret, then resolve cert-manager
   issue before next expiry window.
6. After recovery, confirm:
   ```bash
   kubectl get certificate arbitra-api-tls -n production
   kubectl get secret arbitra-api-tls -n production
   ```

## Manual renewal

```bash
# Renew if expiring within 30 days
sudo bash backend/scripts/ssl-renew.sh

# Force renewal regardless of expiry
sudo bash backend/scripts/ssl-renew.sh --force
```

---

## nginx Configuration

The HTTP server block in `nginx/nginx.conf` serves the ACME challenge before
redirecting to HTTPS:

```nginx
server {
    listen 80;
    server_name api.arbitra.app;

    location /.well-known/acme-challenge/ {
        root /var/www/certbot;
    }

    location / {
        return 301 https://$server_name$request_uri;
    }
}
```

The HTTPS server block uses TLS 1.2/1.3 with strong ciphers and HSTS:

```nginx
ssl_protocols TLSv1.2 TLSv1.3;
ssl_ciphers HIGH:!aNULL:!MD5;
add_header Strict-Transport-Security "max-age=31536000; includeSubDomains" always;
```

---

## Troubleshooting

### Challenge fails (403 / connection refused)

- Confirm port 80 is open and nginx is running.
- Confirm the domain resolves to this server: `dig api.arbitra.app`.
- Check nginx logs: `docker logs arbitra-nginx`.

### Certificate not found after renewal

- Confirm `/etc/letsencrypt/live/<domain>/fullchain.pem` exists.
- Re-run `ssl-renew.sh --force` to copy certs to the nginx paths.

### nginx reports "certificate file not found"

- The `ssl-certs` and `ssl-private` Docker volumes may be empty.
- Run `ssl-setup.sh` first, then restart nginx.

### Let's Encrypt rate limits

Let's Encrypt enforces [rate limits](https://letsencrypt.org/docs/rate-limits/).
Use the staging environment for testing:

```bash
# Add --staging flag to certbot in ssl-setup.sh for testing
certbot certonly --staging --webroot ...
```

---

## Security Notes

- The private key (`arbitra.key`) is chmod `600` — readable only by root.
- Certificates auto-renew before expiry; no manual intervention needed.
- HSTS is enabled with a 1-year max-age to prevent downgrade attacks.
- TLS 1.0 and 1.1 are disabled; only TLS 1.2 and 1.3 are accepted.
