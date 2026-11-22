# API Gateway WAF & Rate Limiting

Issue: #135

## Overview

Edge protection is enforced at the Nginx gateway (`backend/nginx/nginx.conf`) before requests reach the NestJS API.

## Rate limits

| Scope | Limit | Nginx zone | Notes |
|---|---:|---|---|
| Per IP | 1000 requests/minute | `api_ip_limit` | Applied on `/` |
| Per API key | 100 requests/minute | `api_key_limit` | Key from `X-API-Key` or `Authorization: Bearer <token>`; empty key is not bucketed |
| Auth endpoints | 5 r/s + burst 5 | `auth_limit` | `/api/auth/(login|register|refresh|mfa)` |
| Payment endpoints | 2 r/s + burst 3 | `strict_limit` | `/api/payments/` |

Rate-limit rejections return HTTP `429` (`limit_req_status 429`).

## WAF rules

Conservative pattern rules block obvious malicious payloads with HTTP `403`:

- **SQL injection**: `UNION SELECT`, `SELECT ... FROM`, `INSERT INTO ... VALUES`, `DROP TABLE`, `SLEEP()`, `BENCHMARK()`, `OR 1=1`, trailing SQL comment markers in URI/args.
- **XSS**: `<script`, `javascript:`, `onerror=`, `onload=`, `<iframe`, `<svg on...` in URI/args.
- **Known bad bots/scanners**: `sqlmap`, `nikto`, `nmap`, `masscan`, `acunetix`, `nessus`, `dirbuster`, `zgrab`, `libwww-perl`, old python-requests/curl signatures.

Rules are intentionally narrow to keep false positives below 0.1%. Do not add broad keyword blocks without sampled-log review.

## Logging and alerting

- Blocked requests: `/var/log/nginx/arbitra-waf-blocked.log` (`waf_blocked` format, includes request id, UA, IP, API-key presence).
- Standard access/error logs remain in `/var/log/nginx/arbitra-access.log` and `/var/log/nginx/arbitra-error.log`.
- Prometheus alert `WAFBlockedRequestsSpike` warns on abnormal 403 spikes; investigate blocked log before tightening rules.

## Manual verification

```bash
# Legitimate request should pass
curl -i https://api.arbitra.app/health

# SQLi pattern should be blocked at gateway
curl -i "https://api.arbitra.app/api/search?q=1%20UNION%20SELECT%201"

# XSS pattern should be blocked at gateway
curl -i "https://api.arbitra.app/api/search?q=%3Cscript%3Ealert(1)%3C/script%3E"

# Rate limit check (expect eventual 429)
for i in $(seq 1 1205); do curl -s -o /dev/null -w "%{http_code}\n" https://api.arbitra.app/health; done
```

## Tuning

- Review false positives from `arbitra-waf-blocked.log` before changing patterns.
- For endpoint-specific limits, add a dedicated `limit_req_zone` and location block rather than tightening global limits.
- For API-key identity in production, prefer gateway-issued API key IDs over raw bearer tokens in rate-limit keys.
