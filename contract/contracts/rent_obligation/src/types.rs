use soroban_sdk::{contracttype, Address, String, Vec};

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct RentObligation {
    pub agreement_id: String,
    pub owner: Address,
    pub minted_at: u64,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct BurnRecord {
    pub token_id: String,
    pub burned_by: Address,
    pub burned_at: u64,
    pub reason: String,
}

/// A single breakpoint in a progressive late-fee schedule. A tier applies
/// once the payment is at least `min_days_overdue` full days past the end of
/// the grace period, up to (but not including) the next tier's threshold.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct LateFeeTier {
    /// Inclusive lower bound, in full days overdue *after* the grace period
    /// has elapsed. The first tier in a schedule must have this set to 0.
    pub min_days_overdue: u32,
    /// Flat late fee charged once this tier applies (in token units).
    pub fee_amount: i128,
}

/// Configurable rent schedule for an agreement: due date, grace window, and
/// the progressive late-fee tiers applied once the grace period lapses.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct RentSchedule {
    pub rent_amount: i128,
    /// Timestamp the current rent cycle is due.
    pub due_date: u64,
    /// Length of a rent cycle in seconds; used to advance `due_date` on
    /// settlement.
    pub period_secs: u64,
    /// Grace window (in seconds) after `due_date` before any late fee
    /// applies.
    pub grace_period_secs: u64,
    /// Progressive fee tiers, ordered by strictly increasing
    /// `min_days_overdue`, starting at 0.
    pub tiers: Vec<LateFeeTier>,
    /// Cap on the late fee that can be charged in a single cycle. `0` means
    /// no cap.
    pub max_late_fee: i128,
}

/// Tracks the late fee assessed for the obligation's current, unsettled rent
/// cycle. Reset to zero once the cycle is settled.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct LateFeeState {
    pub total_late_fees: i128,
    /// 1-based index of the highest tier applied this cycle; 0 if none.
    pub last_tier: u32,
}
