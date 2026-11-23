import {
  BadRequestException,
  ExecutionContext,
  ForbiddenException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MfaEnforcementGuard } from './mfa-enforcement.guard';

describe('MfaEnforcementGuard', () => {
  const configService = {
    get: jest.fn().mockReturnValue('100000'),
  } as unknown as ConfigService;
  const guard = new MfaEnforcementGuard(configService);

  function context(amount?: string | number | null, mfaVerified = false) {
    return {
      switchToHttp: () => ({
        getRequest: () => ({ body: { amount }, user: { mfaVerified } }),
      }),
    } as unknown as ExecutionContext;
  }

  it('allows payments below the configured high-value threshold', () => {
    expect(guard.canActivate(context(99999))).toBe(true);
  });

  it('requires a verified MFA login for payments at or above the threshold', () => {
    expect(() => guard.canActivate(context(100000))).toThrow(
      ForbiddenException,
    );
    expect(guard.canActivate(context(100000, true))).toBe(true);
  });

  it('requires MFA when a payment operation does not expose its amount', () => {
    expect(() => guard.canActivate(context())).toThrow(ForbiddenException);
    expect(guard.canActivate(context(undefined, true))).toBe(true);
  });

  it('rejects malformed or negative payment amounts', () => {
    expect(() => guard.canActivate(context('not-a-number'))).toThrow(
      BadRequestException,
    );
    expect(() => guard.canActivate(context(-1))).toThrow(BadRequestException);
  });
});
