use soroban_sdk::{contracttype, Address, String, Vec};

// ─── Reputation decay parameters (documented curve) ─────────────────────────
//
// Reputation is tracked in integer points and decays lazily:
// * No decay for the first `DECAY_GRACE_SECS` after the last reputation
//   update (rating, slash, or reward — the "last-active" moment).
// * After the grace period, reputation decays linearly by
//   `DECAY_PER_DAY_POINTS` for every full day of inactivity.
// * Decay floors at zero — reputation can never go negative.
//
// Decay is computed on read (`get_reputation` / `get_effective_score`)
// without writing, and settled into storage whenever reputation is updated.

/// Grace period before decay starts: 7 days.
pub const DECAY_GRACE_SECS: u64 = 7 * 86_400;
/// Points lost per full day of inactivity after the grace period.
pub const DECAY_PER_DAY_POINTS: u32 = 10;
/// Seconds in a day, used for decay bucketing.
pub const SECS_PER_DAY: u64 = 86_400;
/// Upper bound on reputation points.
pub const MAX_REPUTATION_POINTS: u32 = 10_000;
/// Reputation points earned per rating star (1-5 stars → 20-100 points).
pub const REP_POINTS_PER_STAR: u32 = 20;

// ─── Effective score parameters ──────────────────────────────────────────────
//
// `effective_score = decayed_reputation + min(staked / STAKE_STROOPS_PER_POINT,
// MAX_STAKE_POINTS)`. Only the live (slashable, non-unbonding) stake counts.

/// Stroops of live stake required per effective-score point (1 XLM = 1 point).
pub const STAKE_STROOPS_PER_POINT: i128 = 10_000_000;
/// Cap on the stake contribution to the effective score.
pub const MAX_STAKE_POINTS: u32 = 5_000;

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct AgentInfo {
    pub agent: Address,
    pub external_profile_hash: String,
    pub verified: bool,
    pub registered_at: u64,
    pub verified_at: Option<u64>,
    pub total_ratings: u32,
    pub total_score: u32,
    pub completed_agreements: u32,
}

impl AgentInfo {
    pub fn average_rating(&self) -> u32 {
        self.total_score
            .checked_div(self.total_ratings)
            .unwrap_or(0)
    }
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Rating {
    pub rater: Address,
    pub agent: Address,
    pub score: u32,
    pub rated_at: u64,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ContractState {
    pub admin: Address,
    pub initialized: bool,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct AgentTransaction {
    pub transaction_id: String,
    pub agent: Address,
    pub parties: Vec<Address>,
    pub completed: bool,
}

/// Decaying reputation state, settled lazily on updates.
///
/// `last_decay_ts` is the ledger timestamp at which `points` was last
/// settled; reads compute the decayed value from it without writing.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ReputationState {
    pub points: u32,
    pub last_decay_ts: u64,
}

impl ReputationState {
    /// Reputation after applying the documented decay curve up to `now`.
    pub fn decayed_points(&self, now: u64) -> u32 {
        let grace_end = self.last_decay_ts.saturating_add(DECAY_GRACE_SECS);
        if now <= grace_end {
            return self.points;
        }
        let days_inactive = (now - grace_end) / SECS_PER_DAY;
        let decay = days_inactive.saturating_mul(DECAY_PER_DAY_POINTS as u64);
        if decay >= self.points as u64 {
            0
        } else {
            self.points - decay as u32
        }
    }

    /// Persist the decay up to `now` into `points` and restart the clock.
    pub fn settle(&mut self, now: u64) {
        self.points = self.decayed_points(now);
        if now > self.last_decay_ts {
            self.last_decay_ts = now;
        }
    }
}

/// Per-agent stake vault.
///
/// `staked` is the live, slashable balance that counts toward the effective
/// score. `pending` is stake queued for withdrawal; it stays slashable until
/// withdrawn but no longer contributes to the effective score.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct StakeVault {
    pub staked: i128,
    pub pending: i128,
    pub unbond_available_at: u64,
}

impl StakeVault {
    pub fn empty() -> Self {
        StakeVault {
            staked: 0,
            pending: 0,
            unbond_available_at: 0,
        }
    }
}

/// Staking configuration set by the admin.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct StakeConfig {
    /// Token used for bonding (e.g. wrapped XLM).
    pub token: Address,
    /// Seconds between an unbond request and withdrawal eligibility.
    pub unbonding_period: u64,
}
