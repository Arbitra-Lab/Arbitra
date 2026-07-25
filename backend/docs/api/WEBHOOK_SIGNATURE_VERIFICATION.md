# Webhook Signature Verification

## Headers

Outbound webhook deliveries (sent by Arbitra to a registered endpoint) include:

- `X-Webhook-Timestamp` — epoch milliseconds when the request was signed
- `X-Webhook-Nonce` — a strictly monotonically increasing value, unique per delivery attempt
- `X-Webhook-Signature` — HMAC-SHA256 hex digest over timestamp + nonce + body

Inbound webhook requests handled by Arbitra (e.g. from KYC/anchor/screening providers)
must include at minimum `X-Webhook-Timestamp` and `X-Webhook-Signature`; `X-Webhook-Nonce`
is checked for replay protection when the sender provides it, but is optional for
backward compatibility with third-party senders that don't implement it.

## Signature Algorithm

- algorithm: `HMAC-SHA256`
- signing input: `<timestamp>.<nonce>.<raw-request-body>`
  (when no nonce is used, the segment is empty: `<timestamp>..<raw-request-body>`)
- encoding: lowercase hex digest

## Validation Rules (receiver-side)

To verify an Arbitra webhook delivery:

1. Read the raw request body — do not re-serialize parsed JSON.
2. Recompute `HMAC-SHA256(secret, "<timestamp>.<nonce>.<rawBody>")` using the
   `X-Webhook-Timestamp` and `X-Webhook-Nonce` header values.
3. Compare against `X-Webhook-Signature` using a constant-time comparison.
4. Reject if the timestamp is outside your tolerance window (recommended: 5 minutes).
5. Reject if you have already seen that nonce within your tolerance window
   (replay protection) — keep a short-lived cache (e.g. `nonce -> expiresAt`)
   keyed by nonce, sized to your tolerance window.
6. Reject requests missing either header, or if your configured secret is missing.

## Protected Endpoints (inbound to Arbitra)

- `/api/v1/anchor/webhook`
- `/api/kyc/webhook`
- `/api/api/alerts/webhook`
- `/api/screenings/tenant/webhook`

## Example (receiver-side verification)

```ts
import crypto from 'crypto';

function verify(rawBody: string, timestamp: string, nonce: string, signature: string, secret: string) {
  const expected = crypto
    .createHmac('sha256', secret)
    .update(`${timestamp}.${nonce}.${rawBody}`)
    .digest('hex');

  const sigBuf = Buffer.from(signature, 'hex');
  const expBuf = Buffer.from(expected, 'hex');
  if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
    throw new Error('invalid signature');
  }

  const ageMs = Math.abs(Date.now() - Number(timestamp));
  if (ageMs > 5 * 60 * 1000) {
    throw new Error('stale timestamp');
  }

  if (seenNonces.has(nonce)) {
    throw new Error('replayed nonce');
  }
  seenNonces.set(nonce, Date.now() + 5 * 60 * 1000);
}
```
