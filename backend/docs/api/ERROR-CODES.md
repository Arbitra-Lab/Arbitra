# Houston Housing API Error Codes

All error responses use a stable machine-readable `error` code alongside the HTTP status. Clients should branch on `error`, not `message` — messages may be localised or refined over time.

## Error Response Shape

```json
{
  "statusCode": 422,
  "error": "PAYMENT_AMOUNT_BELOW_MINIMUM",
  "message": "Payment amount must be at least 1 stroop.",
  "timestamp": "2025-04-01T09:30:00Z",
  "path": "/api/payments",
  "requestId": "req_a1b2c3d4"
}
```

---

## Registry

### Authentication & Authorisation — 4xx

| Code                        | HTTP | Description                                                       |
| --------------------------- | ---- | ----------------------------------------------------------------- |
| `INVALID_CREDENTIALS`       | 401  | Email or password is incorrect.                                   |
| `TOKEN_EXPIRED`             | 401  | JWT access token has expired — refresh via `/auth/refresh`.       |
| `TOKEN_INVALID`             | 401  | JWT signature is invalid or the token is malformed.               |
| `TOKEN_MISSING`             | 401  | `Authorization: Bearer <token>` header is absent.                 |
| `REFRESH_TOKEN_EXPIRED`     | 401  | Refresh token has expired — re-authenticate.                      |
| `MFA_REQUIRED`              | 403  | Multi-factor authentication challenge must be completed.          |
| `MFA_INVALID_CODE`          | 403  | TOTP code is incorrect or expired.                                |
| `FORBIDDEN`                 | 403  | Authenticated user does not have the required role or permission. |
| `STELLAR_CHALLENGE_INVALID` | 401  | SEP-0010 challenge response failed verification.                  |
| `STELLAR_CHALLENGE_EXPIRED` | 401  | SEP-0010 challenge has expired (15-minute window).                |

### Validation — 400

| Code                       | HTTP | Description                                                                    |
| -------------------------- | ---- | ------------------------------------------------------------------------------ |
| `VALIDATION_ERROR`         | 400  | One or more request fields failed schema validation. `details` array included. |
| `INVALID_UUID`             | 400  | A path or query parameter must be a valid UUID.                                |
| `INVALID_DATE_RANGE`       | 400  | `from` date is after `to` date.                                                |
| `INVALID_CURRENCY`         | 400  | Currency code is not supported.                                                |
| `INVALID_JSON`             | 400  | Request body could not be parsed as JSON.                                      |
| `IDEMPOTENCY_KEY_CONFLICT` | 409  | An in-flight request with this idempotency key already exists.                 |

### User — 4xx

| Code                  | HTTP | Description                                            |
| --------------------- | ---- | ------------------------------------------------------ |
| `USER_NOT_FOUND`      | 404  | No user matches the provided ID.                       |
| `USER_ALREADY_EXISTS` | 409  | A user with this email address is already registered.  |
| `USER_SOFT_DELETED`   | 403  | This account has been deactivated.                     |
| `EMAIL_NOT_VERIFIED`  | 403  | Email address must be verified before proceeding.      |
| `KYC_REQUIRED`        | 403  | KYC verification must be completed before this action. |
| `KYC_REJECTED`        | 403  | KYC verification was rejected.                         |

### Rent Agreements — 4xx

| Code                       | HTTP | Description                                                       |
| -------------------------- | ---- | ----------------------------------------------------------------- |
| `AGREEMENT_NOT_FOUND`      | 404  | No agreement matches the provided ID.                             |
| `AGREEMENT_NOT_ACTIVE`     | 422  | Operation requires an active agreement.                           |
| `AGREEMENT_ALREADY_EXISTS` | 409  | An active agreement already exists for this property/tenant pair. |
| `AGREEMENT_EXPIRED`        | 422  | Agreement end date has passed.                                    |
| `INVALID_RENT_AMOUNT`      | 422  | Rent amount must be greater than zero.                            |
| `AGREEMENT_NOT_AUTHORIZED` | 403  | Caller is not a party to this agreement.                          |

### Payments — 4xx

| Code                           | HTTP | Description                                       |
| ------------------------------ | ---- | ------------------------------------------------- |
| `PAYMENT_NOT_FOUND`            | 404  | No payment matches the provided ID.               |
| `PAYMENT_AMOUNT_BELOW_MINIMUM` | 422  | Payment amount must be at least 1 stroop.         |
| `PAYMENT_ALREADY_PROCESSED`    | 409  | Payment has already been completed or cancelled.  |
| `INSUFFICIENT_BALANCE`         | 422  | Stellar account does not have sufficient balance. |
| `PAYMENT_METHOD_NOT_FOUND`     | 404  | No payment method matches the provided ID.        |

### Escrow & Disputes — 4xx

| Code                       | HTTP | Description                                     |
| -------------------------- | ---- | ----------------------------------------------- |
| `ESCROW_NOT_FOUND`         | 404  | No escrow record matches the provided ID.       |
| `ESCROW_ALREADY_ACTIVE`    | 409  | An escrow is already active for this agreement. |
| `DISPUTE_NOT_FOUND`        | 404  | No dispute matches the provided ID.             |
| `DISPUTE_ALREADY_RESOLVED` | 409  | Dispute has already been resolved.              |
| `DISPUTE_NOT_AUTHORIZED`   | 403  | Caller is not a party to this dispute.          |

### Properties — 4xx

| Code                      | HTTP | Description                                        |
| ------------------------- | ---- | -------------------------------------------------- |
| `PROPERTY_NOT_FOUND`      | 404  | No property matches the provided ID.               |
| `PROPERTY_NOT_AVAILABLE`  | 422  | Property is not available for the requested dates. |
| `PROPERTY_ALREADY_LISTED` | 409  | Property is already listed.                        |

### Storage / File Upload — 4xx

| Code                    | HTTP | Description                            |
| ----------------------- | ---- | -------------------------------------- |
| `FILE_TOO_LARGE`        | 413  | Uploaded file exceeds the 10 MB limit. |
| `UNSUPPORTED_FILE_TYPE` | 415  | File MIME type is not permitted.       |
| `STORAGE_UPLOAD_FAILED` | 500  | Cloud storage upload failed — retry.   |

### Rate Limiting — 429

| Code                       | HTTP | Description                                  |
| -------------------------- | ---- | -------------------------------------------- |
| `RATE_LIMIT_EXCEEDED`      | 429  | Too many requests. See `Retry-After` header. |
| `RATE_LIMIT_AUTH_EXCEEDED` | 429  | Authentication endpoint rate limit reached.  |

### Server Errors — 5xx

| Code                         | HTTP | Description                                               |
| ---------------------------- | ---- | --------------------------------------------------------- |
| `INTERNAL_SERVER_ERROR`      | 500  | Unexpected server error. Retry with exponential back-off. |
| `DATABASE_ERROR`             | 500  | Database operation failed.                                |
| `STELLAR_NODE_UNAVAILABLE`   | 503  | Stellar Horizon is temporarily unavailable.               |
| `ANCHOR_SERVICE_UNAVAILABLE` | 503  | Anchor service is temporarily unavailable.                |

---

## Handling Validation Errors

When `VALIDATION_ERROR` is returned, a `details` array describes each field error:

```json
{
  "statusCode": 400,
  "error": "VALIDATION_ERROR",
  "message": "Request validation failed",
  "details": [
    {
      "field": "amountStroops",
      "message": "amountStroops must be a positive integer"
    },
    { "field": "memo", "message": "memo must not exceed 28 characters" }
  ]
}
```

---

## Adding a New Error Code

1. Add the code and description to the appropriate table above.
2. Throw using the project's `AppException` helper so the global filter picks it up:

```typescript
throw new AppException('AGREEMENT_NOT_FOUND', HttpStatus.NOT_FOUND, {
  agreementId,
});
```

3. Add a corresponding `@ApiResponse` decorator to the affected endpoint(s).
