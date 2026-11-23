import {
  BadRequestException,
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

interface PaymentRequest {
  body?: { amount?: string | number | null };
  user?: { mfaVerified?: boolean };
}

@Injectable()
export class MfaEnforcementGuard implements CanActivate {
  constructor(private readonly configService: ConfigService) {}

  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<PaymentRequest>();
    const rawAmount = request.body?.amount;
    const amount =
      rawAmount === undefined || rawAmount === null
        ? Number.POSITIVE_INFINITY
        : Number(rawAmount);
    if (
      rawAmount !== undefined &&
      rawAmount !== null &&
      ((typeof rawAmount === 'string' && rawAmount.trim() === '') ||
        !Number.isFinite(amount) ||
        amount < 0)
    ) {
      throw new BadRequestException('Payment amount must be a valid number');
    }

    const threshold = Number(
      this.configService.get<string>('HIGH_VALUE_PAYMENT_THRESHOLD') ??
        '100000',
    );
    if (!Number.isFinite(threshold) || threshold <= 0) {
      throw new Error('HIGH_VALUE_PAYMENT_THRESHOLD must be a positive number');
    }

    if (amount >= threshold && request.user?.mfaVerified !== true) {
      throw new ForbiddenException(
        'MFA verification is required for high-value payments',
      );
    }
    return true;
  }
}
