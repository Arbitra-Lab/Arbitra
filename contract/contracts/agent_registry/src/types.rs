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

// ─── Outcome signals, slashing history & policy ──────────────────────────────
//
// Agents accrue or lose reputation from the outcome of the transactions they
// arbitrate. Authorized reporters (e.g. an escrow/arbitration contract) submit
// an `OutcomeSignal` once a transaction concludes: a clean `Settlement` earns
// reputation, while a `DisputeLoss` (adverse ruling) both lowers reputation and
// slashes a portion of the agent's staked bond. Consequences are governed by an
// admin-set `OutcomePolicy`, and every slash is appended to the agent's
// on-chain `SlashRecord` history.

/// Outcome of a concluded transaction, submitted by an authorized reporter.
#[contracttype]
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum OutcomeSignal {
    /// The transaction settled cleanly in the agent's favor.
    Settlement,
    /// The agent lost a dispute (adverse ruling).
    DisputeLoss,
}

/// Why an agent's stake/reputation was slashed.
#[contracttype]
#[derive(Clone, Copy, Debug, Eq, PartialEq)]
pub enum SlashReason {
    /// Direct administrative slash via `slash_agent`.
    AdminAction,
    /// Adverse dispute ruling reported through an outcome signal.
    DisputeLoss,
}

/// A single slashing event in an agent's history.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct SlashRecord {
    /// Ledger timestamp at which the slash was applied.
    pub timestamp: u64,
    /// Stake (stroops) removed from the vault into the slashed pool.
    pub stake_slashed: i128,
    /// Reputation points actually removed (after flooring at zero).
    pub reputation_slashed: u32,
    /// What triggered the slash.
    pub reason: SlashReason,
    /// Associated transaction id, empty for a direct admin slash.
    pub transaction_id: String,
}

/// Consequences applied when an outcome signal is submitted. Admin-set.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct OutcomePolicy {
    /// Reputation points awarded on a successful settlement (capped at
    /// `MAX_REPUTATION_POINTS`).
    pub settlement_reward: u32,
    /// Reputation points removed on a lost dispute (floored at zero).
    pub dispute_rep_penalty: u32,
    /// Stake (stroops) slashed on a lost dispute, clamped to the agent's
    /// available stake.
    pub dispute_stake_slash: i128,
}
