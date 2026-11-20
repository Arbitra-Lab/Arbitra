/** Ledger account that backs the protocol insurance fund (see InsuranceModule). */
export const INSURANCE_POOL_ACCOUNT_ID = 'insurance:pool';

/**
 * Fraction of each captured platform fee that is routed into the insurance
 * pool instead of fee revenue. Defaults to 10%; override via env for testing
 * or a protocol parameter change.
 */
export function getInsurancePoolFeeShare(): number {
  const raw = process.env.INSURANCE_POOL_FEE_SHARE;
  const parsed = raw !== undefined ? Number(raw) : NaN;
  return Number.isFinite(parsed) && parsed >= 0 && parsed <= 1 ? parsed : 0.1;
}
