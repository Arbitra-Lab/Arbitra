import { BadRequestException } from '@nestjs/common';
import { PaymentInterval } from './entities/payment-schedule.entity';
import {
  createCipheriv,
  createDecipheriv,
  createHash,
  randomBytes,
} from 'crypto';

export function ensureUserId(userId: string): void {
  if (!userId) {
    throw new BadRequestException('User ID is required');
  }
}

/** Rounds to the nearest cent, avoiding binary-float artifacts like 30.000000000000004. */
export function roundMoney(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

/**
 * The amount actually available to a customer once a payment is captured —
 * net of platform fees. Falls back to the gross amount when netAmount hasn't
 * been recorded (e.g. legacy rows, or flows with zero fee).
 */
export function getNetCapturedAmount(payment: {
  amount: number;
  netAmount?: number | null;
}): number {
  const net = payment.netAmount;
  return roundMoney(
    Number(net === null || net === undefined ? payment.amount : net),
  );
}

/** How much of a payment's net captured amount remains eligible for refund. */
export function getRefundableAmount(payment: {
  amount: number;
  netAmount?: number | null;
  refundAmount?: number | null;
}): number {
  const captured = getNetCapturedAmount(payment);
  const alreadyRefunded = roundMoney(Number(payment.refundAmount ?? 0));
  return roundMoney(captured - alreadyRefunded);
}

/**
 * Refund guard: rejects a refund request that would push total refunds for a
 * payment past its net captured amount, accounting for prior partial refunds.
 */
export function assertRefundWithinLimit(
  payment: {
    amount: number;
    netAmount?: number | null;
    refundAmount?: number | null;
  },
  requestedAmount: number,
): void {
  const refundable = getRefundableAmount(payment);
  if (roundMoney(requestedAmount) > refundable + 0.005) {
    throw new BadRequestException(
      `Refund amount ${requestedAmount} exceeds refundable balance ${refundable.toFixed(2)}`,
    );
  }
}

export function getIdempotencyKey(dto: {
  idempotencyKey?: unknown;
}): string | null {
  return typeof dto.idempotencyKey === 'string' ? dto.idempotencyKey : null;
}

export function addDays(date: Date, days: number): Date {
  const next = new Date(date.getTime());
  next.setDate(next.getDate() + days);
  return next;
}

export function calculateNextRunAt(
  date: Date,
  interval: PaymentInterval,
): Date {
  const next = new Date(date.getTime());
  switch (interval) {
    case PaymentInterval.WEEKLY:
      return addDays(next, 7);
    case PaymentInterval.MONTHLY:
      next.setMonth(next.getMonth() + 1);
      return next;
    case PaymentInterval.QUARTERLY:
      next.setMonth(next.getMonth() + 3);
      return next;
    case PaymentInterval.YEARLY:
      next.setFullYear(next.getFullYear() + 1);
      return next;
    default:
      return addDays(next, 30);
  }
}

export function parseEscrowReference(referenceNumber: string): number | null {
  if (referenceNumber?.startsWith('escrow:')) {
    const escrowIdStr = referenceNumber.substring('escrow:'.length);
    const escrowId = parseInt(escrowIdStr, 10);
    return isNaN(escrowId) ? null : escrowId;
  }
  return null;
}

export function mapWebhookStatus(webhookStatus: string): string {
  const statusMap: Record<string, string> = {
    completed: 'completed',
    successful: 'completed',
    success: 'completed',
    pending: 'pending',
    processing: 'pending',
    failed: 'failed',
    error: 'failed',
    refunded: 'refunded',
    cancelled: 'failed',
  };
  return statusMap[webhookStatus?.toLowerCase()] ?? 'pending';
}

export function encryptMetadata(data: Record<string, unknown>): string {
  const secret = process.env.PAYMENT_METADATA_SECRET;
  if (!secret) {
    throw new BadRequestException(
      'PAYMENT_METADATA_SECRET is required to store sensitive metadata',
    );
  }

  const iv = randomBytes(12);
  const key = createHash('sha256').update(secret).digest();
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const payload = Buffer.from(JSON.stringify(data));
  const encrypted = Buffer.concat([cipher.update(payload), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString('hex')}:${tag.toString('hex')}:${encrypted.toString('hex')}`;
}

export function decryptMetadata(
  payload: string | null,
): Record<string, unknown> | null {
  if (!payload) {
    return null;
  }

  const secret = process.env.PAYMENT_METADATA_SECRET;
  if (!secret) {
    return null;
  }

  const [ivHex, tagHex, dataHex] = payload.split(':');
  if (!ivHex || !tagHex || !dataHex) {
    return null;
  }

  const iv = Buffer.from(ivHex, 'hex');
  const tag = Buffer.from(tagHex, 'hex');
  const data = Buffer.from(dataHex, 'hex');
  const key = createHash('sha256').update(secret).digest();
  const decipher = createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  const decrypted = Buffer.concat([decipher.update(data), decipher.final()]);
  return JSON.parse(decrypted.toString('utf8')) as Record<string, unknown>;
}
