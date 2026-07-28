use soroban_sdk::{contracttype, Address, String, Vec};

// ── Weighted Voting Types ──────────────────────────────────────────────────

/// Admin-set stats used to compute an arbiter's voting weight.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ArbiterStats {
    /// 0-100; drives rating_multiplier (rating/50 → 0.0x-2.0x)
    pub rating: u32,
    /// Total disputes the arbiter has resolved; drives experience_multiplier
    pub disputes_resolved: u32,
}

/// Computed voting weight for an arbiter.
/// Multipliers are stored scaled ×100 (e.g. 50 = 0.50×, 200 = 2.00×).
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct VotingWeight {
    pub arbiter: Address,
    /// Always 100
    pub base_weight: u32,
    /// rating × 2  (range 0–200, representing 0.0×–2.0×)
    pub rating_multiplier: u32,
    /// min(disputes_resolved × 2, 200)  (range 0–200)
    pub experience_multiplier: u32,
    /// base × rating_mult/100 × exp_mult/100, minimum 1
    pub total_weight: u32,
}

/// A single weighted vote cast by an arbiter.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct WeightedVote {
    pub arbiter: Address,
    pub vote: DisputeOutcome,
    pub weight: u32,
    pub timestamp: u64,
}

/// Accumulated weighted-voting state for a dispute.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct WeightedDisputeVotes {
    pub w_votes_claimant: u32,
    pub w_votes_respondent: u32,
    /// Ordered list of arbiters who have cast a weighted vote.
    /// voters[0] is used for tie-breaking (first vote wins).
    pub voters: Vec<Address>,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum DisputeOutcome {
    FavorClaimant,
    FavorRespondent,
}

/// A `DisputeOutcome` that may be absent — used in stored `#[contracttype]` structs
/// where soroban's XDR layer cannot represent `Option<DisputeOutcome>` directly.
/// `None` means "no vote cast" (participation) or "not yet finalized" (assignment).
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum OptionalOutcome {
    None,
    FavorClaimant,
    FavorRespondent,
}

impl OptionalOutcome {
    pub fn from_outcome(outcome: DisputeOutcome) -> Self {
        match outcome {
            DisputeOutcome::FavorClaimant => OptionalOutcome::FavorClaimant,
            DisputeOutcome::FavorRespondent => OptionalOutcome::FavorRespondent,
        }
    }

    pub fn to_outcome(&self) -> Option<DisputeOutcome> {
        match self {
            OptionalOutcome::None => None,
            OptionalOutcome::FavorClaimant => Some(DisputeOutcome::FavorClaimant),
            OptionalOutcome::FavorRespondent => Some(DisputeOutcome::FavorRespondent),
        }
    }
}

// ── Staked Weighted Voting (quorum + slashing) ─────────────────────────────

/// Per-arbiter economic profile used to derive staked voting weight.
///
/// `reputation_multiplier` is stored scaled ×100 (100 = 1.00×, 250 = 2.50×).
/// The voting weight for an arbiter is
///   `weight = staked_amount × reputation_multiplier / 100`.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ArbiterStake {
    /// Amount the arbiter currently has staked.
    pub staked_amount: i128,
    /// Reputation multiplier scaled ×100 (100 = 1.00×).
    pub reputation_multiplier: u32,
}

/// Governance parameters for quorum gating and non-voter slashing.
///
/// Both fields are basis points (10000 = 100%).
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct QuorumConfig {
    /// Fraction of total assigned weight that must vote before a dispute can finalize.
    pub quorum_bps: u32,
    /// Fraction of a non-voter's snapshotted stake that is slashed on finalize.
    pub slash_bps: u32,
}

/// Snapshot of one arbiter's assignment to a dispute.
///
/// `weight` and `staked_snapshot` are frozen at assignment time so that stake
/// changes made after assignment cannot alter this dispute's tally or slashing.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct AssignedArbiter {
    pub arbiter: Address,
    /// `staked_amount × reputation_multiplier / 100`, snapshotted at assignment.
    pub weight: i128,
    /// `staked_amount` snapshotted at assignment; slashing base for non-voters.
    pub staked_snapshot: i128,
    pub voted: bool,
    /// The cast vote, or `OptionalOutcome::None` until the arbiter votes.
    pub vote: OptionalOutcome,
    /// Ledger timestamp of the vote (0 until voted); used for tie-breaking.
    pub voted_at: u64,
}

/// Assignment-level snapshot for a dispute's staked-weighted vote.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct DisputeAssignment {
    pub dispute_id: String,
    pub arbiters: Vec<Address>,
    /// Sum of all assigned arbiters' snapshotted weights.
    pub total_weight: i128,
    /// Quorum basis points snapshotted at assignment.
    pub quorum_bps: u32,
    /// Slash basis points snapshotted at assignment.
    pub slash_bps: u32,
    /// `total_weight × quorum_bps / 10000`, snapshotted at assignment.
    pub quorum_weight_required: i128,
    /// Voting window deadline; votes cast after this are rejected.
    pub deadline: u64,
    pub assigned_at: u64,
    pub finalized: bool,
    /// The finalized outcome, or `OptionalOutcome::None` while still open.
    pub outcome: OptionalOutcome,
}

/// Per-arbiter participation row returned by `get_dispute_tally`.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ArbiterParticipation {
    pub arbiter: Address,
    pub weight: i128,
    pub voted: bool,
    pub vote: OptionalOutcome,
}

/// Full tally + quorum progress snapshot returned by `get_dispute_tally`.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct DisputeTally {
    pub dispute_id: String,
    pub w_votes_claimant: i128,
    pub w_votes_respondent: i128,
    pub total_assigned_weight: i128,
    pub voted_weight: i128,
    pub quorum_weight_required: i128,
    pub quorum_reached: bool,
    pub finalized: bool,
    pub outcome: OptionalOutcome,
    pub participants: Vec<ArbiterParticipation>,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ContractState {
    pub admin: Address,
    pub initialized: bool,
    pub min_votes_required: u32,
    pub case_registry: Address,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct TimeoutConfig {
    pub escrow_timeout_days: u64,
    pub dispute_timeout_days: u64,
    pub payment_timeout_days: u64,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Arbiter {
    pub address: Address,
    pub added_at: u64,
    pub active: bool,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Dispute {
    pub case_id: String,
    pub details_hash: String,
    pub raised_at: u64,
    pub resolved: bool,
    pub resolved_at: Option<u64>,
    pub votes_favor_claimant: u32,
    pub votes_favor_respondent: u32,
    pub voters: Vec<Address>,
}

impl Dispute {
    pub fn get_outcome(&self) -> Option<DisputeOutcome> {
        if !self.resolved {
            return None;
        }

        if self.votes_favor_claimant > self.votes_favor_respondent {
            Some(DisputeOutcome::FavorClaimant)
        } else {
            Some(DisputeOutcome::FavorRespondent)
        }
    }
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Vote {
    pub arbiter: Address,
    pub case_id: String,
    pub favor_claimant: bool,
    pub voted_at: u64,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum AppealStatus {
    Pending,
    InProgress,
    Approved,
    Rejected,
    Cancelled,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct AppealVote {
    pub arbiter: Address,
    pub vote: DisputeOutcome,
    pub timestamp: u64,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct DisputeAppeal {
    pub id: String,
    pub dispute_id: String,
    pub appellant: Address,
    pub reason: String,
    pub status: AppealStatus,
    pub appeal_arbiters: Vec<Address>,
    pub votes: Vec<AppealVote>,
    pub created_at: u64,
    pub resolved_at: Option<u64>,
}

// ─── Rate Limiting Types ──────────────────────────────────────────────────────

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct RateLimitConfig {
    pub max_calls_per_block: u32,
    pub max_calls_per_user_per_day: u32,
    pub cooldown_blocks: u32,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct UserCallCount {
    pub user: Address,
    pub call_count: u32,
    pub last_call_block: u64,
    pub daily_count: u32,
    pub daily_reset_block: u64,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum RateLimitReason {
    BlockLimitExceeded,
    DailyLimitExceeded,
    CooldownNotMet,
}
