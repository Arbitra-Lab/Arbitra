# Authentication Guide

Arbitra supports two authentication methods: **JWT (email/password)** and **Stellar SEP-0010 (wallet-based)**. Both methods issue a JWT access token that is used the same way in subsequent requests.

---

## 1. JWT Authentication (Email / Password)

### Register

```
POST /api/auth/register
```

**Request body:**

```json
{
  "firstName": "Jane",
  "lastName": "Doe",
  "email": "jane@example.com",
  "password": "SecurePass123!",
  "role": "TENANT"
}
```

**Success — 201:**

```json
{
  "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "refreshToken": "rt_...",
  "user": {
    "id": "usr_01HN7K",
    "email": "jane@example.com",
    "role": "tenant",
    "firstName": "Jane",
    "lastName": "Doe"
  }
}
```

**Error codes:** `USER_ALREADY_EXISTS` (409), `VALIDATION_ERROR` (400).

---

### Login

```
POST /api/auth/login
```

**Request body:**

```json
{
  "email": "jane@example.com",
  "password": "SecurePass123!"
}
```

**Success — 200:** Same shape as the register response.

**Error codes:** `INVALID_CREDENTIALS` (401), `USER_SOFT_DELETED` (403), `MFA_REQUIRED` (403).

---

### Refresh Access Token

```
POST /api/auth/refresh
```

**Request body:**

```json
{ "refreshToken": "rt_..." }
```

**Success — 200:**

```json
{
  "accessToken": "eyJhbGci...",
  "refreshToken": "rt_newtoken..."
}
```

**Error codes:** `REFRESH_TOKEN_EXPIRED` (401), `TOKEN_INVALID` (401).

---

### Logout

```
POST /api/auth/logout
Authorization: Bearer <access_token>
```

Invalidates the current refresh token server-side. Returns 204 on success.

---

## 2. Stellar SEP-0010 Authentication (Wallet)

This flow implements [SEP-0010](https://github.com/stellar/stellar-protocol/blob/master/ecosystem/sep-0010.md) for wallet-based authentication without a password.

### Step 1 — Request a challenge

```
GET /api/auth/stellar/challenge?account=G...
```

**Response — 200:**

```json
{
  "transaction": "AAAAAgAAAAB...",
  "networkPassphrase": "Test SDF Network ; September 2015"
}
```

The `transaction` is a Stellar transaction envelope that must be signed by the wallet's private key.

### Step 2 — Sign and submit

Sign the transaction with the Stellar keypair, then POST the signed envelope:

```
POST /api/auth/stellar/verify
```

**Request body:**

```json
{
  "transaction": "AAAAAgAAAAB...<signed>",
  "account": "GABC...XYZ"
}
```

**Success — 200:** Same JWT response shape as email login.

**Error codes:** `STELLAR_CHALLENGE_INVALID` (401), `STELLAR_CHALLENGE_EXPIRED` (401).

---

## 3. Using the Access Token

Include the JWT in every protected request:

```
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

Token lifetime: **15 minutes** (configurable via `JWT_EXPIRATION`).
Refresh token lifetime: **7 days** (configurable via `JWT_REFRESH_EXPIRATION`).

---

## 4. Multi-Factor Authentication (MFA)

When MFA is enabled on an account, login returns a `MFA_REQUIRED` (403) response with a `mfaToken` instead of a full JWT:

```json
{
  "statusCode": 403,
  "error": "MFA_REQUIRED",
  "mfaToken": "mfa_01HN7K..."
}
```

Complete the challenge:

```
POST /api/auth/mfa/verify
```

```json
{
  "mfaToken": "mfa_01HN7K...",
  "code": "123456"
}
```

On success, returns the standard JWT response.

---

## 5. Password Reset

```
POST /api/auth/forgot-password
```

```json
{ "email": "jane@example.com" }
```

Returns 200 regardless of whether the email exists (prevents enumeration).

```
POST /api/auth/reset-password
```

```json
{
  "token": "<reset_token_from_email>",
  "password": "NewSecurePass123!"
}
```

---

## 6. Role-Based Access

| Role     | Value      | Dashboard    |
| -------- | ---------- | ------------ |
| Tenant   | `tenant`   | `/`          |
| Landlord | `landlord` | `/landlords` |
| Agent    | `agent`    | `/agents`    |
| Admin    | `admin`    | `/landlords` |

The `role` field on the user object uses lowercase. The signup form accepts `TENANT` or `LANDLORD` (uppercase enum).

---

## 7. Demo Accounts

See [DEMO_CREDENTIALS.md](../setup/DEMO_CREDENTIALS.md) for pre-seeded accounts to use during development and testing.
