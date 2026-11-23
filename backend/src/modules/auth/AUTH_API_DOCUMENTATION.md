# Authentication API Reference

HTTP endpoints under `/api/auth` for user registration, login, token refresh, password management, and multi-factor authentication.

**Base path:** `/api/auth`  
**Swagger tag:** `Authentication`  
**Rate limit category:** Auth (stricter limits than general endpoints)

## Endpoints

| Method | Path                  | Auth            | Description                         |
| ------ | --------------------- | --------------- | ----------------------------------- |
| POST   | `/register`           | Public          | Create a new user account           |
| POST   | `/login`              | Public          | Authenticate with email/password    |
| POST   | `/login/mfa/complete` | Public          | Complete login when MFA is required |
| POST   | `/login/mfa/sms`      | Public          | Send SMS MFA fallback code          |
| POST   | `/refresh`            | Public / cookie | Issue new access token              |
| POST   | `/logout`             | JWT             | Invalidate session                  |
| POST   | `/forgot-password`    | Public          | Request password reset email        |
| POST   | `/reset-password`     | Public          | Reset password with token           |
| GET    | `/verify-email`       | Public          | Verify email via query token        |
| POST   | `/2fa/enable`         | JWT             | Start TOTP or SMS enrollment        |
| POST   | `/2fa/verify-setup`   | JWT             | Confirm initial TOTP/SMS code       |
| POST   | `/mfa/enable`         | JWT             | Legacy alias for MFA enrollment     |
| POST   | `/mfa/verify`         | JWT             | Legacy alias for setup verification |
| POST   | `/mfa/disable`        | JWT             | Disable MFA                         |
| POST   | `/mfa/backup-codes`   | JWT             | Regenerate backup codes             |
| GET    | `/mfa/status`         | JWT             | Check MFA enrollment status         |

Stellar wallet authentication lives under `/api/auth/stellar` — see **Stellar Authentication** in Swagger.

## Register

```http
POST /api/auth/register
Content-Type: application/json

{
  "email": "user@example.com",
  "password": "SecurePass123!",
  "firstName": "Jane",
  "lastName": "Doe",
  "role": "tenant"
}
```

**Responses:**

- `201` — `AuthResponseDto` with `accessToken`, user id, role
- `400` — Validation error (weak password, invalid email)
- `409` — Email already registered

Refresh token may be set as an HTTP-only cookie depending on configuration.

## Login

```http
POST /api/auth/login
Content-Type: application/json

{
  "email": "user@example.com",
  "password": "SecurePass123!"
}
```

**Responses:**

- `200` — `AuthResponseDto` with tokens
- `401` — Invalid credentials
- `429` — Too many attempts (account may be locked)

If MFA is enabled, response indicates MFA challenge; call `/login/mfa/complete` with the TOTP code.

## Token refresh

```http
POST /api/auth/refresh
Content-Type: application/json

{ "refreshToken": "<refresh_token>" }
```

Or send the refresh token cookie when `credentials: include` is used in browsers.

**Response:** New `accessToken` (and optionally rotated refresh token).

## Password reset

1. `POST /forgot-password` with `{ "email": "..." }` — sends reset link if account exists
2. `POST /reset-password` with `{ "token": "...", "password": "..." }`

## MFA

Enable TOTP flow:

1. `POST /2fa/enable` — returns a QR code, setup secret, and one-time recovery codes
2. `POST /2fa/verify-setup` with a TOTP code — activates MFA only after code verification
3. `GET /mfa/status` — verify enrollment

Enable SMS fallback by sending `{"method":"sms"}` to `/2fa/enable`; verify the
delivered code at `/2fa/verify-setup`. SMS delivery requires a configured gateway.
For SMS login, call `/login/mfa/sms` with the temporary `mfaToken`, then complete
login using the delivered code at `/login/mfa/complete`.

Disable: `POST /mfa/disable` (requires password or backup code per DTO).

TOTP secrets are stored with AES-256-GCM authenticated encryption. Admin-role endpoints
and high-value payment submission require an access token issued after an MFA challenge.
Configure SMS delivery with `SMS_GATEWAY_URL` (an HTTP JSON endpoint accepting
`to` and `message`) and `SMS_GATEWAY_API_KEY` (Bearer authentication). Set
`HIGH_VALUE_PAYMENT_THRESHOLD` to the minimum payment amount requiring verified MFA
(default: 100000).

## Using JWT on protected routes

```http
Authorization: Bearer <access_token>
```

Apply `@ApiBearerAuth('JWT-auth')` in Swagger to test authenticated endpoints interactively.

## Error format

Auth errors use the standard [ErrorResponseDto](../../common/dto/error-response.dto.ts):

```json
{
  "statusCode": 401,
  "message": "Invalid credentials",
  "code": "AUTH_1001"
}
```

## Security notes

- Passwords hashed with bcrypt (12 rounds)
- Account lockout after repeated failed logins
- Rate limiting on register/login/reset endpoints
- Refresh tokens stored securely; not logged
- Do not commit tokens or API keys to source control

## Related

- [Auth module README](./README.md) — implementation details
- [API documentation](../../docs/api/api-documentation.md) — platform-wide reference
- [Usage guide](../../docs/api/USAGE_GUIDE.md) — integration walkthrough
