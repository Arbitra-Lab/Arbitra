import {
  Injectable,
  Logger,
  UnauthorizedException,
  InternalServerErrorException,
} from '@nestjs/common';
import * as crypto from 'crypto';

export const WEBHOOK_SIGNATURE_HEADER = 'x-webhook-signature';
export const WEBHOOK_TIMESTAMP_HEADER = 'x-webhook-timestamp';
export const WEBHOOK_NONCE_HEADER = 'x-webhook-nonce';
const DEFAULT_TOLERANCE_MS = 5 * 60 * 1000;

/**
 * Verifies inbound webhook signatures and signs/verifies outbound ones.
 *
 * Receiver-side verification (for anyone consuming Arbitra webhooks):
 *   expectedSignature = HMAC_SHA256(secret, `${timestamp}.${nonce}.${rawBody}`)
 * Compare against the `X-Webhook-Signature` header using a constant-time
 * comparison, reject if `X-Webhook-Timestamp` is outside your tolerance
 * window, and reject if `X-Webhook-Nonce` has already been seen within
 * that same window (replay protection). See docs/api/WEBHOOK_SIGNATURE_VERIFICATION.md.
 */
@Injectable()
export class WebhookSignatureService {
  private readonly logger = new Logger(WebhookSignatureService.name);

  // Monotonic clock for nonce generation: microsecond-scale counter that
  // only ever increases, even across multiple calls within the same
  // millisecond or across clock adjustments.
  private lastNonceValue = 0n;

  // Replay cache for nonces we have verified as receivers. Keyed by nonce,
  // valued by the epoch ms at which the entry may be pruned.
  private readonly seenNonces = new Map<string, number>();

  /**
   * Generates a strictly increasing nonce suitable for replay protection.
   */
  generateNonce(): string {
    const candidate = BigInt(Date.now()) * 1000n;
    this.lastNonceValue =
      candidate > this.lastNonceValue ? candidate : this.lastNonceValue + 1n;
    return this.lastNonceValue.toString();
  }

  generateSignature(
    payload: string,
    timestamp: string,
    secret: string,
    nonce = '',
  ): string {
    return crypto
      .createHmac('sha256', secret)
      .update(`${timestamp}.${nonce}.${payload}`)
      .digest('hex');
  }

  createSignedHeaders(payload: string, secret: string): Record<string, string> {
    const timestamp = Date.now().toString();
    const nonce = this.generateNonce();
    const signature = this.generateSignature(payload, timestamp, secret, nonce);

    return {
      'Content-Type': 'application/json',
      'X-Webhook-Timestamp': timestamp,
      'X-Webhook-Nonce': nonce,
      'X-Webhook-Signature': signature,
    };
  }

  /**
   * Verifies a signature and, when a nonce is supplied, enforces replay
   * protection: a nonce may only be accepted once within `toleranceMs`.
   * The nonce is omitted for backward compatibility with callers that
   * pre-date nonce support (in which case only signature + timestamp are
   * checked).
   */
  verifySignature(
    payload: string,
    signature: string | undefined,
    timestamp: string | undefined,
    secret: string | undefined,
    toleranceMs: number = DEFAULT_TOLERANCE_MS,
    nonce?: string,
  ): void {
    if (!signature || !timestamp) {
      this.logger.warn('Rejected unsigned webhook request');
      throw new UnauthorizedException('Missing webhook signature');
    }

    if (!secret) {
      this.logger.error('Webhook secret is not configured');
      throw new InternalServerErrorException('Webhook secret misconfigured');
    }

    const parsedTimestamp = Number(timestamp);
    if (!Number.isFinite(parsedTimestamp)) {
      this.logger.warn('Rejected webhook with invalid timestamp');
      throw new UnauthorizedException('Invalid webhook timestamp');
    }

    const ageMs = Math.abs(Date.now() - parsedTimestamp);
    if (ageMs > toleranceMs) {
      this.logger.warn(`Rejected stale webhook request (${ageMs}ms old)`);
      throw new UnauthorizedException('Webhook timestamp expired');
    }

    const expectedSignature = this.generateSignature(
      payload,
      timestamp,
      secret,
      nonce ?? '',
    );
    const signatureBuffer = Buffer.from(signature, 'hex');
    const expectedBuffer = Buffer.from(expectedSignature, 'hex');

    if (
      signatureBuffer.length !== expectedBuffer.length ||
      !crypto.timingSafeEqual(signatureBuffer, expectedBuffer)
    ) {
      this.logger.warn('Rejected webhook with invalid signature');
      throw new UnauthorizedException('Invalid webhook signature');
    }

    if (nonce) {
      this.assertNonceNotReplayed(nonce, toleranceMs);
    }
  }

  private assertNonceNotReplayed(nonce: string, toleranceMs: number): void {
    this.pruneExpiredNonces();

    if (this.seenNonces.has(nonce)) {
      this.logger.warn('Rejected replayed webhook nonce');
      throw new UnauthorizedException('Webhook nonce already used');
    }

    this.seenNonces.set(nonce, Date.now() + toleranceMs);
  }

  private pruneExpiredNonces(): void {
    const now = Date.now();
    for (const [nonce, expiresAt] of this.seenNonces) {
      if (expiresAt <= now) {
        this.seenNonces.delete(nonce);
      }
    }
  }
}
