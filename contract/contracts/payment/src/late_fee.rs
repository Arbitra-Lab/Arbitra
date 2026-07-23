//! Late fee calculation logic.
//!
//! Supports both simple (linear) and compounding daily late fee models.
//! Formula:
//!   days_over_grace = days_late - grace_period_days  (clamped to 0)
//!
//!   simple:      late_fee = base * (percentage / 100) * days_over_grace
//!   compounding: late_fee = base * ((1 + percentage/100)^days_over_grace) - base
//!
//!   late_fee = min(late_fee, max_late_fee)

use soroban_sdk::{Address, Env, String, Vec};

use crate::errors::PaymentError;
use crate::storage::DataKey;
use crate::types::{FeeQuote, FeeSchedule, FeeTier, LateFeeConfig, PayerDiscount, RentAgreement};

/// Core calculation: given a config and base rent amount, compute the late fee
/// for `days_late` days past the original due date (grace period included).
///
/// Returns 0 if still within the grace period.
pub fn compute_fee(config: &LateFeeConfig, base_amount: i128, days_late: u32) -> i128 {
    if days_late <= config.grace_period_days {
        return 0;
    }

    let days_over = (days_late - config.grace_period_days) as i128;
    let pct = config.late_fee_percentage as i128; // e.g. 5 means 5%

    let raw_fee = if config.compounding {
        // Compound daily: fee = base * ((100 + pct)^days_over / 100^days_over) - base
        // Accumulate numerator and denominator separately to avoid per-step truncation.
        let numerator_base: i128 = 100 + pct;
        let mut num_pow: i128 = 1;
        let mut den_pow: i128 = 1;
        for _ in 0..days_over {
            num_pow = num_pow.saturating_mul(numerator_base);
            den_pow = den_pow.saturating_mul(100);
        }
        let compounded = base_amount.saturating_mul(num_pow) / den_pow;
        compounded.saturating_sub(base_amount)
    } else {
        // Simple: fee = base * pct / 100 * days_over
        base_amount.saturating_mul(pct).saturating_mul(days_over) / 100
    };

    // Cap at max_late_fee (0 means no cap)
    if config.max_late_fee > 0 && raw_fee > config.max_late_fee {
        config.max_late_fee
    } else {
        raw_fee
    }
}

/// Load config + agreement from storage and compute the late fee amount.
pub fn calculate_late_fee_amount(
    env: &Env,
    agreement_id: &String,
    _payment_id: &String,
    days_late: u32,
) -> Result<i128, PaymentError> {
    let config: LateFeeConfig = env
        .storage()
        .persistent()
        .get(&DataKey::LateFeeConfig(agreement_id.clone()))
        .ok_or(PaymentError::LateFeeConfigNotFound)?;

    let agreement: RentAgreement = env
        .storage()
        .persistent()
        .get(&DataKey::Agreement(agreement_id.clone()))
        .ok_or(PaymentError::AgreementNotFound)?;

    Ok(compute_fee(&config, agreement.monthly_rent, days_late))
}

// ─── Tiered Platform Fee Engine ────────────────────────────────────────────
//
// Resolves the volume tier applicable to a gross payment amount, applies any
// stored per-payer discount on top of the tier's rate, and returns a
// deterministic fee/net split.
//
// Rounding / remainder policy:
//   fee = round_half_to_even(gross * effective_bps / 10_000)
//   net = gross - fee
//
// `net` is always derived by subtracting the rounded `fee` from `gross`
// rather than being independently rounded, so `fee + net == gross` holds
// exactly for every quote. Summing `fee` and `net` across any batch of
// payments therefore exactly reconstructs the summed gross amount: no unit
// ever leaks or is double-charged from rounding. Banker's rounding (round
// half to even) is used instead of round-half-up to avoid the systemic
// upward bias that round-half-up would introduce across a large volume of
// payments.

const BPS_DENOMINATOR: i128 = 10_000;

/// Round `numerator / denominator` to the nearest integer, breaking exact
/// ties by rounding to the nearest even integer (banker's rounding).
/// Requires `numerator >= 0` and `denominator > 0`.
fn round_half_even(numerator: i128, denominator: i128) -> i128 {
    let quotient = numerator / denominator;
    let remainder = numerator % denominator;
    let twice_remainder = remainder.saturating_mul(2);

    if twice_remainder < denominator {
        quotient
    } else if twice_remainder > denominator {
        quotient + 1
    } else if quotient % 2 == 0 {
        quotient
    } else {
        quotient + 1
    }
}

/// Validate that a fee schedule's tiers are well-formed: non-empty, starting
/// at threshold 0, strictly increasing (and therefore non-overlapping), and
/// each with a bps rate no greater than 10_000 (100%).
///
/// Call this at configuration time before persisting a schedule; `quote_fee`
/// trusts that any stored schedule has already passed this check.
pub fn validate_fee_schedule(schedule: &FeeSchedule) -> Result<(), PaymentError> {
    if schedule.tiers.is_empty() {
        return Err(PaymentError::InvalidFeeSchedule);
    }

    let mut prev_threshold: Option<i128> = None;
    for i in 0..schedule.tiers.len() {
        let tier = schedule.tiers.get(i).unwrap();

        if tier.bps > BPS_DENOMINATOR as u32 {
            return Err(PaymentError::InvalidFeeSchedule);
        }

        match prev_threshold {
            None => {
                if tier.threshold != 0 {
                    return Err(PaymentError::InvalidFeeSchedule);
                }
            }
            Some(prev) => {
                if tier.threshold <= prev {
                    return Err(PaymentError::InvalidFeeSchedule);
                }
            }
        }

        prev_threshold = Some(tier.threshold);
    }

    Ok(())
}

/// Resolve the tier applicable to `amount`: the tier with the greatest
/// `threshold` that is still `<= amount`. Assumes `schedule` has already
/// passed [`validate_fee_schedule`] (first tier at threshold 0, strictly
/// increasing thereafter).
pub fn resolve_tier(schedule: &FeeSchedule, amount: i128) -> Result<(u32, u32), PaymentError> {
    if amount < 0 {
        return Err(PaymentError::InvalidAmount);
    }
    if schedule.tiers.is_empty() {
        return Err(PaymentError::InvalidFeeSchedule);
    }

    let mut tier_index: u32 = 0;
    let mut tier_bps: u32 = 0;
    for i in 0..schedule.tiers.len() {
        let tier = schedule.tiers.get(i).unwrap();
        if tier.threshold > amount {
            break;
        }
        tier_index = i;
        tier_bps = tier.bps;
    }

    Ok((tier_index, tier_bps))
}

/// Pure fee quoting core: given an already-validated schedule and a
/// resolved per-payer discount (in bps), compute the tier, fee, discount and
/// net for `amount`. No `Env`/storage access — deterministic and
/// side-effect free by construction.
pub fn quote_fee_with_schedule(
    schedule: &FeeSchedule,
    discount_bps: u32,
    amount: i128,
) -> Result<FeeQuote, PaymentError> {
    if amount < 0 {
        return Err(PaymentError::InvalidAmount);
    }

    let (tier_index, tier_bps) = resolve_tier(schedule, amount)?;
    let effective_bps = tier_bps.saturating_sub(discount_bps);

    let full_fee = round_half_even(amount.saturating_mul(tier_bps as i128), BPS_DENOMINATOR);
    let fee = round_half_even(amount.saturating_mul(effective_bps as i128), BPS_DENOMINATOR);
    let discount = full_fee - fee;
    let net = amount - fee;

    Ok(FeeQuote {
        tier_index,
        gross: amount,
        fee,
        discount,
        net,
    })
}

/// The implicit schedule used when no fee schedule has been configured: a
/// single 0 bps tier starting at 0, i.e. no fee is charged until an admin
/// explicitly configures tiers via `set_fee_schedule`.
fn default_fee_schedule(env: &Env) -> FeeSchedule {
    let mut tiers: Vec<FeeTier> = Vec::new(env);
    tiers.push_back(FeeTier {
        threshold: 0,
        bps: 0,
    });
    FeeSchedule { tiers }
}

/// Quote the fee for `amount` charged to `payer`: resolves the applicable
/// tier from the stored fee schedule (falling back to a zero-fee default if
/// none is configured), applies the payer's stored discount (if any), and
/// returns the fee/net split.
///
/// Read-only: performs no storage writes and emits no events, so identical
/// on-chain state (schedule + discount) always yields identical output for
/// identical inputs.
pub fn quote_fee(env: &Env, amount: i128, payer: &Address) -> Result<FeeQuote, PaymentError> {
    let schedule: FeeSchedule = env
        .storage()
        .instance()
        .get(&DataKey::FeeSchedule)
        .unwrap_or_else(|| default_fee_schedule(env));

    let discount_bps = env
        .storage()
        .persistent()
        .get::<DataKey, PayerDiscount>(&DataKey::PayerDiscount(payer.clone()))
        .map(|d| d.discount_bps)
        .unwrap_or(0);

    quote_fee_with_schedule(&schedule, discount_bps, amount)
}
