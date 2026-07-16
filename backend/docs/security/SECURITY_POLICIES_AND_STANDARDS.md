# Security Policies and Standards

## Overview

This document defines the backend security baseline for Arbitra. It covers data
protection, access control, encryption, API and database safeguards, incident
response, vulnerability handling, and the minimum checklist contributors should
apply when shipping changes.

Use this document alongside:

- `SECURITY.md`
- `backend/docs/encryption.md`
- `backend/src/modules/security/`
- `backend/src/common/middleware/`

## Security Objectives

- protect personally identifiable information and financial records
- reduce unauthorized access to tenant, landlord, agent, and admin workflows
- detect suspicious activity early and preserve forensic evidence
- keep secret management, encryption, and auditability aligned with compliance expectations
- ensure documentation and implementation stay synchronized

## Data Protection Policy

| Data class                | Examples                                    | Protection standard                               |
| ------------------------- | ------------------------------------------- | ------------------------------------------------- |
| Public product data       | non-sensitive listing details, public docs  | integrity and availability controls               |
| Internal operational data | queue state, analytics, internal metrics    | least privilege and audit access                  |
| Sensitive personal data   | email, phone, KYC payloads, wallet metadata | encryption at rest, limited access, audit logging |
| Security telemetry        | audit logs, threat events, security events  | integrity, retention, incident access control     |

Required controls:

- collect only the minimum personal data needed for the feature
- encrypt sensitive values at rest and protect them in transit
- avoid logging raw secrets, KYC payloads, or credential material
- use hashed lookup columns when exact-match search is required on encrypted fields
- review retention needs before adding new regulated data

## Access Control Standards

- every sensitive route must require authentication
- privileged routes must require explicit role or permission checks
- admin-only actions must generate audit records
- service-level access to repositories and secrets should follow least privilege

Current enforcement points:

- `JwtAuthGuard` for authenticated access
- `RolesGuard` for role-based route restriction
- `PermissionsGuard` and `RbacService` for fine-grained authorization
- `AuditLogInterceptor` and audit decorators for privileged action tracking

## Encryption Standards

`backend/src/modules/security/encryption.service.ts` currently implements:

- AES-256-GCM for authenticated encryption
- PBKDF2-derived keys with per-value salt
- support for multiple active keys to allow rotation
- deterministic HMAC-SHA256 hashing for exact-match lookup use cases
- signed token generation and verification

Key management requirements:

- never hardcode encryption keys in source control
- use `SECURITY_ENCRYPTION_KEYS` or `SECURITY_ENCRYPTION_KEY` for application encryption material
- use `DB_ENCRYPTION_SECRET_ID` with AWS Secrets Manager when available
- track key versioning and rotation windows explicitly
- test decryption fallback before removing old keys from rotation lists

## Authentication Policy

- use JWT-based authentication for protected API access
- enforce expiration and token renewal rules
- protect authentication routes with dedicated rate limiting
- support stronger assurance measures such as MFA for administrative access

Current safeguards in code:

- auth-specific rate limiting middleware on registration, login, forgot password, and reset password routes
- failed login counters and account lock fields on `users`
- `mfa_devices` persistence for multifactor state
- dual support for password and Stellar-based authentication flows

## Authorization Policy

Authorization is documented in detail in `AUTHORIZATION_DOCUMENTATION.md`. At a
policy level:

- coarse role checks are required for admin and sensitive operations
- fine-grained permission checks should be used where resource/action rules are more precise than a single role gate
- RBAC seeds must remain aligned with route enforcement and UI capabilities

## API Security Standards

- apply `Helmet` and security headers globally
- enforce CSRF protection for applicable flows
- validate and sanitize request payloads before persistence
- use request size limits to reduce abuse and accidental oversized payloads
- rate limit sensitive and high-frequency endpoints
- avoid leaking stack traces or sensitive error details to clients
- sign or verify sensitive webhook and callback traffic

## Database Security Standards

- prefer encrypted or hashed storage for sensitive fields
- protect database credentials through environment variables or secret stores
- disable schema synchronization in production
- use explicit migrations and verify rollback behavior for risky changes
- back up regularly and test restore procedures
- restrict operational access to production data and logs

## Threat Detection and Monitoring

`ThreatDetectionMiddleware` and `ThreatDetectionService` currently provide:

- request inspection on API traffic
- in-memory rate anomaly detection
- SQL injection, XSS, and path traversal pattern checks
- bot user-agent heuristics
- temporary IP blocking for repeated abuse
- threat event persistence for review and follow-up

## Incident Response Procedures

1. Detect via monitoring, threat events, audits, or user report.
2. Triage severity and affected blast radius.
3. Contain by blocking traffic, disabling functionality, or rotating secrets.
4. Eradicate root cause and validate the fix.
5. Recover service safely and monitor for recurrence.
6. Produce a post-incident report and document follow-up actions.

Minimum incident artifacts:

- incident identifier and timeline
- affected systems and data classes
- containment steps taken
- recovery verification evidence
- preventive action items with owners

## Vulnerability Management Process

- public contributors should use the private reporting process described in `SECURITY.md`
- internal findings should be logged with severity, scope, and remediation owner
- prioritize critical auth, encryption, and data access flaws first
- patch, test, and document the change in the same PR where possible
- rerun the most relevant test suites and verify logging behavior after fixes

## Compliance Standards

The current compliance service is oriented around:

- GDPR-style auditability and encryption checks
- SOC 2-style access control and monitoring controls
- PCI-DSS-style audit logging and administrative access expectations

## Security Checklist

- [ ] no secrets or credentials committed to source control
- [ ] authentication is enforced on protected routes
- [ ] role or permission checks cover sensitive operations
- [ ] request payloads are validated and sanitized
- [ ] sensitive data is encrypted or hashed appropriately
- [ ] audit logs are emitted for privileged changes
- [ ] rate limiting and abuse protections are considered
- [ ] error responses do not leak internal implementation details
- [ ] new integrations document their trust boundaries and secret handling
- [ ] retention and backup implications are reviewed for new sensitive data
