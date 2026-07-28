use soroban_sdk::{contracttype, Address, Env, String};

use crate::errors::DisputeError;
use crate::events;
use crate::rate_limit;
use crate::storage::DataKey;
use crate::types::{
    AppealStatus, AppealVote, Arbiter, ArbiterParticipation, ArbiterStake, ArbiterStats,
    AssignedArbiter, ContractState, Dispute, DisputeAppeal, DisputeAssignment, DisputeOutcome,
    DisputeTally, OptionalOutcome, QuorumConfig, TimeoutConfig, Vote, VotingWeight,
    WeightedDisputeVotes, WeightedVote,
};

const APPEAL_WINDOW_SECONDS: u64 = 7 * 24 * 60 * 60;
const APPEAL_MIN_ARBITERS: u32 = 3;
const APPEAL_FEE: i128 = 100;
const DEFAULT_ESCROW_TIMEOUT_DAYS: u64 = 14;
const DEFAULT_DISPUTE_TIMEOUT_DAYS: u64 = 30;
const DEFAULT_PAYMENT_TIMEOUT_DAYS: u64 = 7;

pub fn get_timeout_config(env: &Env) -> TimeoutConfig {
    env.storage()
        .instance()
        .get(&DataKey::TimeoutConfig)
        .unwrap_or(TimeoutConfig {
            escrow_timeout_days: DEFAULT_ESCROW_TIMEOUT_DAYS,
            dispute_timeout_days: DEFAULT_DISPUTE_TIMEOUT_DAYS,
            payment_timeout_days: DEFAULT_PAYMENT_TIMEOUT_DAYS,
        })
}

pub fn set_timeout_config(
    env: &Env,
    admin: Address,
    config: TimeoutConfig,
) -> Result<(), DisputeError> {
    let state: ContractState = env
        .storage()
        .instance()
        .get(&DataKey::State)
        .ok_or(DisputeError::NotInitialized)?;

    admin.require_auth();
    if admin != state.admin {
        return Err(DisputeError::Unauthorized);
    }

    if config.escrow_timeout_days == 0
        || config.dispute_timeout_days == 0
        || config.payment_timeout_days == 0
    {
        return Err(DisputeError::InvalidTimeoutConfig);
    }

    env.storage()
        .instance()
        .set(&DataKey::TimeoutConfig, &config);
    env.storage().instance().extend_ttl(500000, 500000);
    Ok(())
}

/// Lifecycle status of a case as reported by its originating registry contract
/// (an escrow, freelance milestone, trade-finance, or insurance-claim contract).
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum CaseStatus {
    Draft,
    Pending,
    Active,
    Completed,
    Cancelled,
    Terminated,
    Disputed,
}

/// Generic arbitrable case, fetched cross-contract from whichever registry
/// contract owns `case_id` (escrow, freelance, trade-finance, insurance, etc.).
/// Any contract wishing to route disputes through this arbitration engine
/// must expose a `get_case(case_id) -> Option<Case>` function matching this shape.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Case {
    pub case_id: String,
    /// Party that initiated the underlying agreement (e.g. depositor, client, buyer, insurer).
    pub claimant: Address,
    /// Counterparty to the agreement (e.g. beneficiary, freelancer, seller, policyholder).
    pub respondent: Address,
    pub status: CaseStatus,
}

pub fn add_arbiter(env: &Env, admin: Address, arbiter: Address) -> Result<(), DisputeError> {
    let state: ContractState = env
        .storage()
        .instance()
        .get(&DataKey::State)
        .ok_or(DisputeError::NotInitialized)?;

    admin.require_auth();

    if admin != state.admin {
        return Err(DisputeError::Unauthorized);
    }

    let key = DataKey::Arbiter(arbiter.clone());
    if env.storage().persistent().has(&key) {
        return Err(DisputeError::ArbiterAlreadyExists);
    }

    let arbiter_info = Arbiter {
        address: arbiter.clone(),
        added_at: env.ledger().timestamp(),
        active: true,
    };

    env.storage().persistent().set(&key, &arbiter_info);
    env.storage().persistent().extend_ttl(&key, 500000, 500000);

    let list_key = DataKey::ArbiterList;
    let mut arbiter_list: soroban_sdk::Vec<Address> = env
        .storage()
        .persistent()
        .get(&list_key)
        .unwrap_or(soroban_sdk::Vec::new(env));
    arbiter_list.push_back(arbiter.clone());
    env.storage().persistent().set(&list_key, &arbiter_list);
    env.storage()
        .persistent()
        .extend_ttl(&list_key, 500000, 500000);

    let count_key = DataKey::ArbiterCount;
    let count: u32 = env.storage().persistent().get(&count_key).unwrap_or(0);
    env.storage().persistent().set(&count_key, &(count + 1));
    env.storage()
        .persistent()
        .extend_ttl(&count_key, 500000, 500000);

    events::arbiter_added(env, admin, arbiter);

    Ok(())
}

pub fn raise_dispute(
    env: &Env,
    raiser: Address,
    case_id: String,
    details_hash: String,
) -> Result<(), DisputeError> {
    raiser.require_auth();

    // Rate limiting check
    rate_limit::check_rate_limit(env, &raiser, "raise_dispute")?;

    let state: ContractState = env
        .storage()
        .instance()
        .get(&DataKey::State)
        .ok_or(DisputeError::NotInitialized)?;

    if details_hash.is_empty() {
        return Err(DisputeError::InvalidDetailsHash);
    }

    let key = DataKey::Dispute(case_id.clone());
    if env.storage().persistent().has(&key) {
        return Err(DisputeError::DisputeAlreadyExists);
    }

    // Cross-contract call to the case's registry contract (escrow, freelance,
    // trade-finance, insurance, ...) to fetch its current parties and status.
    let case: Option<Case> = env.invoke_contract(
        &state.case_registry,
        &soroban_sdk::symbol_short!("get_case"),
        soroban_sdk::vec![env, case_id.clone().into()],
    );

    let case = case.ok_or(DisputeError::CaseNotFound)?;

    // Validate the case is in Active status
    if case.status != CaseStatus::Active {
        return Err(DisputeError::InvalidCaseState);
    }

    // Validate raiser is either the claimant or the respondent
    if raiser != case.claimant && raiser != case.respondent {
        return Err(DisputeError::Unauthorized);
    }

    let dispute = Dispute {
        case_id: case_id.clone(),
        details_hash: details_hash.clone(),
        raised_at: env.ledger().timestamp(),
        resolved: false,
        resolved_at: None,
        votes_favor_claimant: 0,
        votes_favor_respondent: 0,
        voters: soroban_sdk::Vec::new(env),
    };

    env.storage().persistent().set(&key, &dispute);
    env.storage().persistent().extend_ttl(&key, 500000, 500000);

    events::dispute_raised(env, case_id, details_hash);

    Ok(())
}

pub fn vote_on_dispute(
    env: &Env,
    arbiter: Address,
    case_id: String,
    favor_claimant: bool,
) -> Result<(), DisputeError> {
    if !env.storage().persistent().has(&DataKey::Initialized) {
        return Err(DisputeError::NotInitialized);
    }

    arbiter.require_auth();

    // Rate limiting check
    rate_limit::check_rate_limit(env, &arbiter, "vote_on_dispute")?;

    let arbiter_key = DataKey::Arbiter(arbiter.clone());
    let arbiter_info: Arbiter = env
        .storage()
        .persistent()
        .get(&arbiter_key)
        .ok_or(DisputeError::ArbiterNotFound)?;

    if !arbiter_info.active {
        return Err(DisputeError::ArbiterNotFound);
    }

    let dispute_key = DataKey::Dispute(case_id.clone());
    let mut dispute: Dispute = env
        .storage()
        .persistent()
        .get(&dispute_key)
        .ok_or(DisputeError::DisputeNotFound)?;

    if dispute.resolved {
        return Err(DisputeError::DisputeAlreadyResolved);
    }

    let vote_key = DataKey::Vote(case_id.clone(), arbiter.clone());
    if env.storage().persistent().has(&vote_key) {
        return Err(DisputeError::AlreadyVoted);
    }

    let vote = Vote {
        arbiter: arbiter.clone(),
        case_id: case_id.clone(),
        favor_claimant,
        voted_at: env.ledger().timestamp(),
    };

    env.storage().persistent().set(&vote_key, &vote);
    env.storage()
        .persistent()
        .extend_ttl(&vote_key, 500000, 500000);

    if favor_claimant {
        dispute.votes_favor_claimant += 1;
    } else {
        dispute.votes_favor_respondent += 1;
    }
    dispute.voters.push_back(arbiter.clone());

    env.storage().persistent().set(&dispute_key, &dispute);
    env.storage()
        .persistent()
        .extend_ttl(&dispute_key, 500000, 500000);

    events::vote_cast(env, case_id, arbiter, favor_claimant);

    Ok(())
}

pub fn resolve_dispute(env: &Env, case_id: String) -> Result<DisputeOutcome, DisputeError> {
    let state: ContractState = env
        .storage()
        .instance()
        .get(&DataKey::State)
        .ok_or(DisputeError::NotInitialized)?;

    let dispute_key = DataKey::Dispute(case_id.clone());
    let mut dispute: Dispute = env
        .storage()
        .persistent()
        .get(&dispute_key)
        .ok_or(DisputeError::DisputeNotFound)?;

    if dispute.resolved {
        return Err(DisputeError::DisputeAlreadyResolved);
    }

    let total_votes = dispute.votes_favor_claimant + dispute.votes_favor_respondent;

    if total_votes < state.min_votes_required {
        return Err(DisputeError::InsufficientVotes);
    }

    dispute.resolved = true;
    dispute.resolved_at = Some(env.ledger().timestamp());

    env.storage().persistent().set(&dispute_key, &dispute);
    env.storage()
        .persistent()
        .extend_ttl(&dispute_key, 500000, 500000);

    let outcome = if dispute.votes_favor_claimant > dispute.votes_favor_respondent {
        DisputeOutcome::FavorClaimant
    } else {
        DisputeOutcome::FavorRespondent
    };

    events::dispute_resolved(
        env,
        case_id,
        outcome.clone(),
        dispute.votes_favor_claimant,
        dispute.votes_favor_respondent,
    );

    Ok(outcome)
}

pub fn resolve_dispute_on_timeout(
    env: &Env,
    case_id: String,
) -> Result<DisputeOutcome, DisputeError> {
    let dispute_key = DataKey::Dispute(case_id.clone());
    let mut dispute: Dispute = env
        .storage()
        .persistent()
        .get(&dispute_key)
        .ok_or(DisputeError::DisputeNotFound)?;

    if dispute.resolved {
        return Err(DisputeError::DisputeAlreadyResolved);
    }

    let timeout_days = get_timeout_config(env).dispute_timeout_days;
    let timeout_seconds = timeout_days.saturating_mul(86_400);
    let deadline = dispute.raised_at.saturating_add(timeout_seconds);
    let now = env.ledger().timestamp();
    if now <= deadline {
        return Err(DisputeError::TimeoutNotReached);
    }

    dispute.resolved = true;
    dispute.resolved_at = Some(now);
    env.storage().persistent().set(&dispute_key, &dispute);
    env.storage()
        .persistent()
        .extend_ttl(&dispute_key, 500000, 500000);

    let outcome = if dispute.votes_favor_claimant > dispute.votes_favor_respondent {
        DisputeOutcome::FavorClaimant
    } else {
        DisputeOutcome::FavorRespondent
    };

    events::dispute_timeout(env, case_id.clone());
    events::dispute_resolved(
        env,
        case_id,
        outcome.clone(),
        dispute.votes_favor_claimant,
        dispute.votes_favor_respondent,
    );
    Ok(outcome)
}

pub fn get_dispute(env: &Env, case_id: String) -> Option<Dispute> {
    let key = DataKey::Dispute(case_id);
    env.storage().persistent().get(&key)
}

pub fn get_arbiter(env: &Env, arbiter: Address) -> Option<Arbiter> {
    let key = DataKey::Arbiter(arbiter);
    env.storage().persistent().get(&key)
}

pub fn get_arbiter_count(env: &Env) -> u32 {
    let key = DataKey::ArbiterCount;
    env.storage().persistent().get(&key).unwrap_or(0)
}

pub fn get_vote(env: &Env, case_id: String, arbiter: Address) -> Option<Vote> {
    let key = DataKey::Vote(case_id, arbiter);
    env.storage().persistent().get(&key)
}

pub fn create_appeal(
    env: &Env,
    appellant: Address,
    dispute_id: String,
    reason: String,
) -> Result<String, DisputeError> {
    if !env.storage().persistent().has(&DataKey::Initialized) {
        return Err(DisputeError::NotInitialized);
    }

    appellant.require_auth();

    if reason.is_empty() {
        return Err(DisputeError::InvalidDetailsHash);
    }

    let dispute_key = DataKey::Dispute(dispute_id.clone());
    let dispute: Dispute = env
        .storage()
        .persistent()
        .get(&dispute_key)
        .ok_or(DisputeError::DisputeNotFound)?;

    if !dispute.resolved {
        return Err(DisputeError::InvalidCaseState);
    }

    let resolved_at = dispute
        .resolved_at
        .ok_or(DisputeError::DisputeAlreadyResolved)?;
    let now = env.ledger().timestamp();

    if now > resolved_at + APPEAL_WINDOW_SECONDS {
        return Err(DisputeError::AppealWindowExpired);
    }

    let existing_appeal_key = DataKey::AppealForDispute(dispute_id.clone());
    if env.storage().persistent().has(&existing_appeal_key) {
        return Err(DisputeError::AppealAlreadyExists);
    }

    let arbiter_list_key = DataKey::ArbiterList;
    let arbiter_list: soroban_sdk::Vec<Address> = env
        .storage()
        .persistent()
        .get(&arbiter_list_key)
        .unwrap_or(soroban_sdk::Vec::new(env));

    let mut selected_arbiters = soroban_sdk::Vec::new(env);

    for arbiter in arbiter_list.iter() {
        if dispute.voters.contains(arbiter.clone()) {
            continue;
        }

        let arbiter_info: Option<Arbiter> = env
            .storage()
            .persistent()
            .get(&DataKey::Arbiter(arbiter.clone()));

        if let Some(info) = arbiter_info {
            if info.active {
                selected_arbiters.push_back(arbiter.clone());
            }
        }

        if selected_arbiters.len() >= APPEAL_MIN_ARBITERS {
            break;
        }
    }

    if selected_arbiters.len() < APPEAL_MIN_ARBITERS {
        return Err(DisputeError::InsufficientAppealArbiters);
    }

    let appeal_count_key = DataKey::AppealCount;
    let appeal_count: u32 = env
        .storage()
        .persistent()
        .get(&appeal_count_key)
        .unwrap_or(0);
    let next_count = appeal_count + 1;
    let appeal_id = dispute_id.clone();

    let appeal = DisputeAppeal {
        id: appeal_id.clone(),
        dispute_id: dispute_id.clone(),
        appellant,
        reason,
        status: AppealStatus::Pending,
        appeal_arbiters: selected_arbiters,
        votes: soroban_sdk::Vec::new(env),
        created_at: now,
        resolved_at: None,
    };

    let appeal_key = DataKey::Appeal(appeal_id.clone());
    env.storage().persistent().set(&appeal_key, &appeal);
    env.storage()
        .persistent()
        .extend_ttl(&appeal_key, 500000, 500000);

    env.storage()
        .persistent()
        .set(&existing_appeal_key, &appeal_id);
    env.storage()
        .persistent()
        .extend_ttl(&existing_appeal_key, 500000, 500000);

    env.storage()
        .persistent()
        .set(&appeal_count_key, &next_count);
    env.storage()
        .persistent()
        .extend_ttl(&appeal_count_key, 500000, 500000);

    env.storage()
        .persistent()
        .set(&DataKey::AppealFeePaid(appeal_id.clone()), &APPEAL_FEE);
    env.storage()
        .persistent()
        .set(&DataKey::AppealFeeRefunded(appeal_id.clone()), &false);

    events::appeal_created(env, appeal_id.clone(), dispute_id);

    Ok(appeal_id)
}

pub fn vote_on_appeal(
    env: &Env,
    arbiter: Address,
    appeal_id: String,
    vote: DisputeOutcome,
) -> Result<(), DisputeError> {
    if !env.storage().persistent().has(&DataKey::Initialized) {
        return Err(DisputeError::NotInitialized);
    }

    arbiter.require_auth();

    let appeal_key = DataKey::Appeal(appeal_id.clone());
    let mut appeal: DisputeAppeal = env
        .storage()
        .persistent()
        .get(&appeal_key)
        .ok_or(DisputeError::AppealNotFound)?;

    match appeal.status {
        AppealStatus::Approved | AppealStatus::Rejected | AppealStatus::Cancelled => {
            return Err(DisputeError::AppealAlreadyResolved);
        }
        _ => {}
    }

    if !appeal.appeal_arbiters.contains(arbiter.clone()) {
        return Err(DisputeError::ArbiterNotEligibleForAppeal);
    }

    for existing_vote in appeal.votes.iter() {
        if existing_vote.arbiter == arbiter {
            return Err(DisputeError::AppealAlreadyVoted);
        }
    }

    if appeal.status == AppealStatus::Pending {
        appeal.status = AppealStatus::InProgress;
    }

    appeal.votes.push_back(AppealVote {
        arbiter: arbiter.clone(),
        vote,
        timestamp: env.ledger().timestamp(),
    });

    env.storage().persistent().set(&appeal_key, &appeal);
    env.storage()
        .persistent()
        .extend_ttl(&appeal_key, 500000, 500000);

    events::appeal_voted(env, appeal_id, arbiter);

    Ok(())
}

pub fn resolve_appeal(env: &Env, appeal_id: String) -> Result<(), DisputeError> {
    if !env.storage().persistent().has(&DataKey::Initialized) {
        return Err(DisputeError::NotInitialized);
    }

    let appeal_key = DataKey::Appeal(appeal_id.clone());
    let mut appeal: DisputeAppeal = env
        .storage()
        .persistent()
        .get(&appeal_key)
        .ok_or(DisputeError::AppealNotFound)?;

    match appeal.status {
        AppealStatus::Approved | AppealStatus::Rejected | AppealStatus::Cancelled => {
            return Err(DisputeError::AppealAlreadyResolved);
        }
        _ => {}
    }

    if appeal.votes.len() < APPEAL_MIN_ARBITERS {
        return Err(DisputeError::InsufficientAppealVotes);
    }

    let mut votes_favor_claimant = 0u32;
    let mut votes_favor_respondent = 0u32;

    for appeal_vote in appeal.votes.iter() {
        if appeal_vote.vote == DisputeOutcome::FavorClaimant {
            votes_favor_claimant += 1;
        } else {
            votes_favor_respondent += 1;
        }
    }

    let appeal_outcome = if votes_favor_claimant > votes_favor_respondent {
        DisputeOutcome::FavorClaimant
    } else {
        DisputeOutcome::FavorRespondent
    };

    let dispute: Dispute = env
        .storage()
        .persistent()
        .get(&DataKey::Dispute(appeal.dispute_id.clone()))
        .ok_or(DisputeError::DisputeNotFound)?;

    let original_outcome = dispute
        .get_outcome()
        .ok_or(DisputeError::DisputeAlreadyResolved)?;

    if appeal_outcome != original_outcome {
        appeal.status = AppealStatus::Approved;
        env.storage()
            .persistent()
            .set(&DataKey::AppealFeeRefunded(appeal_id.clone()), &true);
    } else {
        appeal.status = AppealStatus::Rejected;
        env.storage()
            .persistent()
            .set(&DataKey::AppealFeeRefunded(appeal_id.clone()), &false);
    }

    appeal.resolved_at = Some(env.ledger().timestamp());

    env.storage().persistent().set(&appeal_key, &appeal);
    env.storage()
        .persistent()
        .extend_ttl(&appeal_key, 500000, 500000);

    events::appeal_resolved(env, appeal_id, appeal_outcome);

    Ok(())
}

pub fn cancel_appeal(env: &Env, appellant: Address, appeal_id: String) -> Result<(), DisputeError> {
    if !env.storage().persistent().has(&DataKey::Initialized) {
        return Err(DisputeError::NotInitialized);
    }

    appellant.require_auth();

    let appeal_key = DataKey::Appeal(appeal_id.clone());
    let mut appeal: DisputeAppeal = env
        .storage()
        .persistent()
        .get(&appeal_key)
        .ok_or(DisputeError::AppealNotFound)?;

    if appeal.appellant != appellant {
        return Err(DisputeError::Unauthorized);
    }

    match appeal.status {
        AppealStatus::Pending | AppealStatus::InProgress => {}
        _ => return Err(DisputeError::AppealNotCancelable),
    }

    appeal.status = AppealStatus::Cancelled;
    appeal.resolved_at = Some(env.ledger().timestamp());

    env.storage().persistent().set(&appeal_key, &appeal);
    env.storage()
        .persistent()
        .extend_ttl(&appeal_key, 500000, 500000);

    events::appeal_cancelled(env, appeal_id);

    Ok(())
}

pub fn get_appeal(env: &Env, appeal_id: String) -> Option<DisputeAppeal> {
    env.storage().persistent().get(&DataKey::Appeal(appeal_id))
}

// ── Weighted Voting ────────────────────────────────────────────────────────

/// Set rating and disputes-resolved count for an arbiter (admin only).
/// Rating must be 0-100.
pub fn set_arbiter_stats(
    env: &Env,
    admin: Address,
    arbiter: Address,
    rating: u32,
    disputes_resolved: u32,
) -> Result<(), DisputeError> {
    let state: ContractState = env
        .storage()
        .instance()
        .get(&DataKey::State)
        .ok_or(DisputeError::NotInitialized)?;

    admin.require_auth();
    if admin != state.admin {
        return Err(DisputeError::Unauthorized);
    }

    if !env
        .storage()
        .persistent()
        .has(&DataKey::Arbiter(arbiter.clone()))
    {
        return Err(DisputeError::ArbiterNotFound);
    }

    if rating > 100 {
        return Err(DisputeError::InvalidRating);
    }

    let stats = ArbiterStats {
        rating,
        disputes_resolved,
    };
    let key = DataKey::ArbiterStats(arbiter.clone());
    env.storage().persistent().set(&key, &stats);
    env.storage().persistent().extend_ttl(&key, 500000, 500000);

    Ok(())
}

/// Compute the voting weight for an arbiter.
///
/// Formula (integer arithmetic, scale ×100):
///   base_weight          = 100
///   rating_multiplier    = rating × 2              (0–200 representing 0.0×–2.0×)
///   experience_multiplier = min(disputes_resolved × 2, 200)
///   total_weight         = base × rating_mult/100 × exp_mult/100
///                        = rating_mult × exp_mult / 100 (minimum 1)
pub fn calculate_voting_weight(env: &Env, arbiter: Address) -> Result<u32, DisputeError> {
    let arbiter_info: Arbiter = env
        .storage()
        .persistent()
        .get(&DataKey::Arbiter(arbiter.clone()))
        .ok_or(DisputeError::ArbiterNotFound)?;

    if !arbiter_info.active {
        return Err(DisputeError::ArbiterNotFound);
    }

    let stats: ArbiterStats = env
        .storage()
        .persistent()
        .get(&DataKey::ArbiterStats(arbiter))
        .unwrap_or(ArbiterStats {
            rating: 50,
            disputes_resolved: 0,
        });

    let rating_mult = stats.rating * 2; // 0–200
    let exp_mult = if stats.disputes_resolved * 2 < 200 {
        stats.disputes_resolved * 2
    } else {
        200u32
    };

    // base(100) × rating_mult/100 × exp_mult/100 = rating_mult × exp_mult / 100
    let computed = rating_mult * exp_mult / 100;
    let total_weight = if computed == 0 { 1 } else { computed };

    Ok(total_weight)
}

/// Return the full VotingWeight breakdown for an arbiter.
pub fn get_voting_weight(env: &Env, arbiter: Address) -> Result<VotingWeight, DisputeError> {
    let arbiter_info: Arbiter = env
        .storage()
        .persistent()
        .get(&DataKey::Arbiter(arbiter.clone()))
        .ok_or(DisputeError::ArbiterNotFound)?;

    if !arbiter_info.active {
        return Err(DisputeError::ArbiterNotFound);
    }

    let stats: ArbiterStats = env
        .storage()
        .persistent()
        .get(&DataKey::ArbiterStats(arbiter.clone()))
        .unwrap_or(ArbiterStats {
            rating: 50,
            disputes_resolved: 0,
        });

    let rating_mult = stats.rating * 2;
    let exp_mult = if stats.disputes_resolved * 2 < 200 {
        stats.disputes_resolved * 2
    } else {
        200u32
    };

    let computed = rating_mult * exp_mult / 100;
    let total_weight = if computed == 0 { 1 } else { computed };

    Ok(VotingWeight {
        arbiter,
        base_weight: 100,
        rating_multiplier: rating_mult,
        experience_multiplier: exp_mult,
        total_weight,
    })
}

/// Cast a weighted vote on an open dispute.
pub fn vote_on_dispute_weighted(
    env: &Env,
    arbiter: Address,
    dispute_id: String,
    vote: DisputeOutcome,
) -> Result<(), DisputeError> {
    if !env.storage().persistent().has(&DataKey::Initialized) {
        return Err(DisputeError::NotInitialized);
    }

    arbiter.require_auth();

    // Rate limiting check
    rate_limit::check_rate_limit(env, &arbiter, "vote_on_dispute_weighted")?;

    let arbiter_info: Arbiter = env
        .storage()
        .persistent()
        .get(&DataKey::Arbiter(arbiter.clone()))
        .ok_or(DisputeError::ArbiterNotFound)?;

    if !arbiter_info.active {
        return Err(DisputeError::ArbiterNotFound);
    }

    let dispute_key = DataKey::Dispute(dispute_id.clone());
    let dispute: Dispute = env
        .storage()
        .persistent()
        .get(&dispute_key)
        .ok_or(DisputeError::DisputeNotFound)?;

    if dispute.resolved {
        return Err(DisputeError::DisputeAlreadyResolved);
    }

    let wvote_key = DataKey::WeightedVote(dispute_id.clone(), arbiter.clone());
    if env.storage().persistent().has(&wvote_key) {
        return Err(DisputeError::AlreadyVoted);
    }

    let weight = calculate_voting_weight(env, arbiter.clone())?;

    let weighted_vote = WeightedVote {
        arbiter: arbiter.clone(),
        vote: vote.clone(),
        weight,
        timestamp: env.ledger().timestamp(),
    };
    env.storage().persistent().set(&wvote_key, &weighted_vote);
    env.storage()
        .persistent()
        .extend_ttl(&wvote_key, 500000, 500000);

    let wdisp_key = DataKey::WeightedDisputeVotes(dispute_id.clone());
    let mut wdisp: WeightedDisputeVotes =
        env.storage()
            .persistent()
            .get(&wdisp_key)
            .unwrap_or(WeightedDisputeVotes {
                w_votes_claimant: 0,
                w_votes_respondent: 0,
                voters: soroban_sdk::Vec::new(env),
            });

    match vote.clone() {
        DisputeOutcome::FavorClaimant => wdisp.w_votes_claimant += weight,
        DisputeOutcome::FavorRespondent => wdisp.w_votes_respondent += weight,
    }

    wdisp.voters.push_back(arbiter.clone());

    env.storage().persistent().set(&wdisp_key, &wdisp);
    env.storage()
        .persistent()
        .extend_ttl(&wdisp_key, 500000, 500000);

    events::weighted_vote_cast(env, dispute_id, arbiter, weight);

    Ok(())
}

/// Resolve a dispute using weighted vote totals.
///
/// Resolution rules:
/// - Requires `min_votes_required` weighted voters.
/// - Outcome with the highest total weight wins.
/// - Tie broken by the outcome of the first vote cast (first vote wins).
pub fn resolve_dispute_weighted(
    env: &Env,
    dispute_id: String,
) -> Result<DisputeOutcome, DisputeError> {
    let state: ContractState = env
        .storage()
        .instance()
        .get(&DataKey::State)
        .ok_or(DisputeError::NotInitialized)?;

    let dispute_key = DataKey::Dispute(dispute_id.clone());
    let mut dispute: Dispute = env
        .storage()
        .persistent()
        .get(&dispute_key)
        .ok_or(DisputeError::DisputeNotFound)?;

    if dispute.resolved {
        return Err(DisputeError::DisputeAlreadyResolved);
    }

    let wdisp_key = DataKey::WeightedDisputeVotes(dispute_id.clone());
    let wdisp: WeightedDisputeVotes =
        env.storage()
            .persistent()
            .get(&wdisp_key)
            .unwrap_or(WeightedDisputeVotes {
                w_votes_claimant: 0,
                w_votes_respondent: 0,
                voters: soroban_sdk::Vec::new(env),
            });

    if wdisp.voters.len() < state.min_votes_required {
        return Err(DisputeError::InsufficientVotes);
    }

    let total_weight = wdisp.w_votes_claimant + wdisp.w_votes_respondent;

    let outcome = match wdisp
        .w_votes_claimant
        .cmp(&wdisp.w_votes_respondent)
    {
        core::cmp::Ordering::Greater => DisputeOutcome::FavorClaimant,
        core::cmp::Ordering::Less => DisputeOutcome::FavorRespondent,
        core::cmp::Ordering::Equal => {
            // Tie: first vote wins — look up voters[0]'s WeightedVote
            let first_voter = wdisp.voters.get(0).unwrap();
            let first_wvote: WeightedVote = env
                .storage()
                .persistent()
                .get(&DataKey::WeightedVote(dispute_id.clone(), first_voter))
                .unwrap();
            first_wvote.vote
        }
    };

    dispute.resolved = true;
    dispute.resolved_at = Some(env.ledger().timestamp());
    env.storage().persistent().set(&dispute_key, &dispute);
    env.storage()
        .persistent()
        .extend_ttl(&dispute_key, 500000, 500000);

    events::dispute_resolved_by_weight(env, dispute_id, outcome.clone(), total_weight);

    Ok(outcome)
}

/// Return all weighted votes cast for a dispute.
pub fn get_dispute_votes_weighted(
    env: &Env,
    dispute_id: String,
) -> Result<soroban_sdk::Vec<WeightedVote>, DisputeError> {
    let wdisp_key = DataKey::WeightedDisputeVotes(dispute_id.clone());
    let wdisp: WeightedDisputeVotes =
        env.storage()
            .persistent()
            .get(&wdisp_key)
            .unwrap_or(WeightedDisputeVotes {
                w_votes_claimant: 0,
                w_votes_respondent: 0,
                voters: soroban_sdk::Vec::new(env),
            });

    let mut votes = soroban_sdk::Vec::new(env);
    for voter in wdisp.voters.iter() {
        let wvote_key = DataKey::WeightedVote(dispute_id.clone(), voter.clone());
        if let Some(wv) = env
            .storage()
            .persistent()
            .get::<_, WeightedVote>(&wvote_key)
        {
            votes.push_back(wv);
        }
    }
    Ok(votes)
}

// ── Staked Weighted Voting: quorum gating + non-voter slashing ─────────────
//
// This subsystem weights arbiter votes by staked amount and reputation, snapshots
// those weights at *assignment* time (so they cannot be gamed mid-vote), enforces a
// configurable quorum of assigned weight before a dispute may finalize, and slashes
// a documented percentage of stake from assigned arbiters who never voted —
// redistributing the slashed total to the arbiters who did participate.

/// Basis-points denominator. 10000 bps = 100%.
const BPS_DENOMINATOR: i128 = 10_000;
/// Default quorum: 60% of total assigned weight must vote before finalize.
const DEFAULT_QUORUM_BPS: u32 = 6_000;
/// Default slash: 20% of a non-voter's snapshotted stake is slashed.
const DEFAULT_SLASH_BPS: u32 = 2_000;
/// Default voting window if none is supplied at assignment (3 days).
const DEFAULT_VOTING_WINDOW_SECONDS: u64 = 3 * 24 * 60 * 60;
/// Default reputation multiplier (×100) for an arbiter with no stake profile set.
const DEFAULT_REPUTATION_MULTIPLIER: u32 = 100;
/// Upper bound on the reputation multiplier (10.00×), to bound weight inflation.
const MAX_REPUTATION_MULTIPLIER: u32 = 1_000;

/// Read the current quorum/slash configuration, falling back to defaults.
pub fn get_quorum_config(env: &Env) -> QuorumConfig {
    env.storage()
        .instance()
        .get(&DataKey::QuorumConfig)
        .unwrap_or(QuorumConfig {
            quorum_bps: DEFAULT_QUORUM_BPS,
            slash_bps: DEFAULT_SLASH_BPS,
        })
}

/// Set the quorum/slash configuration (admin only).
///
/// `quorum_bps` must be in `1..=10000` (a zero quorum would allow finalizing with
/// no participation, leaving slashed stake with no one to redistribute to).
/// `slash_bps` must be in `0..=10000`.
pub fn set_quorum_config(
    env: &Env,
    admin: Address,
    config: QuorumConfig,
) -> Result<(), DisputeError> {
    let state: ContractState = env
        .storage()
        .instance()
        .get(&DataKey::State)
        .ok_or(DisputeError::NotInitialized)?;

    admin.require_auth();
    if admin != state.admin {
        return Err(DisputeError::Unauthorized);
    }

    if config.quorum_bps == 0
        || config.quorum_bps > BPS_DENOMINATOR as u32
        || config.slash_bps > BPS_DENOMINATOR as u32
    {
        return Err(DisputeError::InvalidQuorumConfig);
    }

    env.storage()
        .instance()
        .set(&DataKey::QuorumConfig, &config);
    env.storage().instance().extend_ttl(500000, 500000);
    Ok(())
}

/// Set an arbiter's stake profile (admin only).
///
/// `reputation_multiplier` is scaled ×100 and must be in `1..=MAX_REPUTATION_MULTIPLIER`.
/// `staked_amount` must be non-negative. Changes made after a dispute has been
/// assigned do not affect that dispute — its weights are snapshotted.
pub fn set_arbiter_stake(
    env: &Env,
    admin: Address,
    arbiter: Address,
    staked_amount: i128,
    reputation_multiplier: u32,
) -> Result<(), DisputeError> {
    let state: ContractState = env
        .storage()
        .instance()
        .get(&DataKey::State)
        .ok_or(DisputeError::NotInitialized)?;

    admin.require_auth();
    if admin != state.admin {
        return Err(DisputeError::Unauthorized);
    }

    if !env
        .storage()
        .persistent()
        .has(&DataKey::Arbiter(arbiter.clone()))
    {
        return Err(DisputeError::ArbiterNotFound);
    }

    if staked_amount < 0
        || reputation_multiplier == 0
        || reputation_multiplier > MAX_REPUTATION_MULTIPLIER
    {
        return Err(DisputeError::InvalidStake);
    }

    let stake = ArbiterStake {
        staked_amount,
        reputation_multiplier,
    };
    let key = DataKey::ArbiterStake(arbiter);
    env.storage().persistent().set(&key, &stake);
    env.storage().persistent().extend_ttl(&key, 500000, 500000);

    Ok(())
}

/// Read an arbiter's stake profile (falls back to `staked_amount: 0`, default multiplier).
pub fn get_arbiter_stake(env: &Env, arbiter: Address) -> ArbiterStake {
    env.storage()
        .persistent()
        .get(&DataKey::ArbiterStake(arbiter))
        .unwrap_or(ArbiterStake {
            staked_amount: 0,
            reputation_multiplier: DEFAULT_REPUTATION_MULTIPLIER,
        })
}

/// Snapshotted voting weight for a stake profile: `staked_amount × rep_mult / 100`.
fn snapshot_weight(stake: &ArbiterStake) -> i128 {
    stake
        .staked_amount
        .saturating_mul(stake.reputation_multiplier as i128)
        / 100
}

/// Assign a set of arbiters to a dispute, snapshotting each one's stake-derived
/// voting weight and the quorum/slash parameters (admin only).
///
/// The snapshot is what makes weights immune to later stake changes.
pub fn assign_dispute_arbiters(
    env: &Env,
    admin: Address,
    dispute_id: String,
    arbiters: soroban_sdk::Vec<Address>,
    voting_window_seconds: u64,
) -> Result<(), DisputeError> {
    let state: ContractState = env
        .storage()
        .instance()
        .get(&DataKey::State)
        .ok_or(DisputeError::NotInitialized)?;

    admin.require_auth();
    if admin != state.admin {
        return Err(DisputeError::Unauthorized);
    }

    let dispute: Dispute = env
        .storage()
        .persistent()
        .get(&DataKey::Dispute(dispute_id.clone()))
        .ok_or(DisputeError::DisputeNotFound)?;
    if dispute.resolved {
        return Err(DisputeError::DisputeAlreadyResolved);
    }

    if env
        .storage()
        .persistent()
        .has(&DataKey::DisputeAssignment(dispute_id.clone()))
    {
        return Err(DisputeError::AlreadyAssigned);
    }

    if arbiters.is_empty() {
        return Err(DisputeError::NoArbitersAssigned);
    }

    let config = get_quorum_config(env);
    let now = env.ledger().timestamp();
    let window = if voting_window_seconds == 0 {
        DEFAULT_VOTING_WINDOW_SECONDS
    } else {
        voting_window_seconds
    };
    let deadline = now.saturating_add(window);

    let mut total_weight: i128 = 0;
    for arbiter in arbiters.iter() {
        let arbiter_info: Arbiter = env
            .storage()
            .persistent()
            .get(&DataKey::Arbiter(arbiter.clone()))
            .ok_or(DisputeError::ArbiterNotFound)?;
        if !arbiter_info.active {
            return Err(DisputeError::ArbiterNotFound);
        }

        let aa_key = DataKey::AssignedArbiter(dispute_id.clone(), arbiter.clone());
        if env.storage().persistent().has(&aa_key) {
            // Duplicate arbiter in the input list.
            return Err(DisputeError::AlreadyAssigned);
        }

        let stake = get_arbiter_stake(env, arbiter.clone());
        let weight = snapshot_weight(&stake);
        total_weight = total_weight.saturating_add(weight);

        let assigned = AssignedArbiter {
            arbiter: arbiter.clone(),
            weight,
            staked_snapshot: stake.staked_amount,
            voted: false,
            vote: OptionalOutcome::None,
            voted_at: 0,
        };
        env.storage().persistent().set(&aa_key, &assigned);
        env.storage().persistent().extend_ttl(&aa_key, 500000, 500000);
    }

    let quorum_weight_required = total_weight * (config.quorum_bps as i128) / BPS_DENOMINATOR;

    let assignment = DisputeAssignment {
        dispute_id: dispute_id.clone(),
        arbiters,
        total_weight,
        quorum_bps: config.quorum_bps,
        slash_bps: config.slash_bps,
        quorum_weight_required,
        deadline,
        assigned_at: now,
        finalized: false,
        outcome: OptionalOutcome::None,
    };
    let key = DataKey::DisputeAssignment(dispute_id.clone());
    env.storage().persistent().set(&key, &assignment);
    env.storage().persistent().extend_ttl(&key, 500000, 500000);

    events::arbiters_assigned(env, dispute_id, total_weight, quorum_weight_required, deadline);

    Ok(())
}

/// Cast a staked-weighted vote on an assigned dispute (assigned arbiters only,
/// before the voting deadline). Uses the arbiter's snapshotted weight.
pub fn cast_staked_vote(
    env: &Env,
    arbiter: Address,
    dispute_id: String,
    vote: DisputeOutcome,
) -> Result<(), DisputeError> {
    if !env.storage().persistent().has(&DataKey::Initialized) {
        return Err(DisputeError::NotInitialized);
    }

    arbiter.require_auth();

    rate_limit::check_rate_limit(env, &arbiter, "cast_staked_vote")?;

    let assignment: DisputeAssignment = env
        .storage()
        .persistent()
        .get(&DataKey::DisputeAssignment(dispute_id.clone()))
        .ok_or(DisputeError::DisputeNotFound)?;

    if assignment.finalized {
        return Err(DisputeError::AlreadyFinalized);
    }

    if env.ledger().timestamp() > assignment.deadline {
        return Err(DisputeError::VotingDeadlinePassed);
    }

    let aa_key = DataKey::AssignedArbiter(dispute_id.clone(), arbiter.clone());
    let mut assigned: AssignedArbiter = env
        .storage()
        .persistent()
        .get(&aa_key)
        .ok_or(DisputeError::ArbiterNotAssigned)?;

    if assigned.voted {
        return Err(DisputeError::AlreadyVoted);
    }

    assigned.voted = true;
    assigned.vote = OptionalOutcome::from_outcome(vote);
    assigned.voted_at = env.ledger().timestamp();
    let weight = assigned.weight;
    env.storage().persistent().set(&aa_key, &assigned);
    env.storage().persistent().extend_ttl(&aa_key, 500000, 500000);

    events::staked_vote_cast(env, dispute_id, arbiter, weight);

    Ok(())
}

/// Adjust an arbiter's current stake balance by `delta` (may be negative),
/// clamping the resulting balance at zero. Returns the amount actually applied.
fn adjust_stake(env: &Env, arbiter: &Address, delta: i128) -> i128 {
    let key = DataKey::ArbiterStake(arbiter.clone());
    let mut stake = get_arbiter_stake(env, arbiter.clone());
    let applied = if delta < 0 && (-delta) > stake.staked_amount {
        // Cannot remove more than is available.
        -stake.staked_amount
    } else {
        delta
    };
    stake.staked_amount += applied;
    env.storage().persistent().set(&key, &stake);
    env.storage().persistent().extend_ttl(&key, 500000, 500000);
    applied
}

/// Finalize a dispute using staked-weighted votes.
///
/// Requirements:
/// - The voting deadline must have passed (so non-voters truly missed their window).
/// - Voted weight must meet or exceed the snapshotted quorum weight.
///
/// Outcome is the side with the greater voted weight; ties break toward the
/// earliest-cast vote. On finalize, each assigned arbiter who did not vote is
/// slashed `slash_bps` of their snapshotted stake, and the entire slashed total is
/// redistributed to the participating arbiters in proportion to their vote weight
/// (any integer-division remainder goes to the first participant, conserving totals).
pub fn finalize_dispute(env: &Env, dispute_id: String) -> Result<DisputeOutcome, DisputeError> {
    if !env.storage().persistent().has(&DataKey::Initialized) {
        return Err(DisputeError::NotInitialized);
    }

    let assignment_key = DataKey::DisputeAssignment(dispute_id.clone());
    let mut assignment: DisputeAssignment = env
        .storage()
        .persistent()
        .get(&assignment_key)
        .ok_or(DisputeError::DisputeNotFound)?;

    if assignment.finalized {
        return Err(DisputeError::AlreadyFinalized);
    }

    let now = env.ledger().timestamp();
    if now <= assignment.deadline {
        return Err(DisputeError::DeadlineNotReached);
    }

    // ── Tally voted weight, per-outcome weight, and earliest vote ──────────
    let mut voted_weight: i128 = 0;
    let mut w_claimant: i128 = 0;
    let mut w_respondent: i128 = 0;
    let mut earliest_vote: Option<DisputeOutcome> = None;
    let mut earliest_ts: u64 = u64::MAX;

    for arbiter in assignment.arbiters.iter() {
        let assigned: AssignedArbiter = env
            .storage()
            .persistent()
            .get(&DataKey::AssignedArbiter(dispute_id.clone(), arbiter.clone()))
            .ok_or(DisputeError::ArbiterNotAssigned)?;
        if assigned.voted {
            voted_weight += assigned.weight;
            match assigned.vote {
                OptionalOutcome::FavorClaimant => w_claimant += assigned.weight,
                OptionalOutcome::FavorRespondent => w_respondent += assigned.weight,
                OptionalOutcome::None => {}
            }
            if assigned.voted_at < earliest_ts {
                earliest_ts = assigned.voted_at;
                earliest_vote = assigned.vote.to_outcome();
            }
        }
    }

    if voted_weight < assignment.quorum_weight_required {
        return Err(DisputeError::QuorumNotReached);
    }

    let outcome = match w_claimant.cmp(&w_respondent) {
        core::cmp::Ordering::Greater => DisputeOutcome::FavorClaimant,
        core::cmp::Ordering::Less => DisputeOutcome::FavorRespondent,
        // Tie broken toward the earliest-cast vote.
        core::cmp::Ordering::Equal => earliest_vote.unwrap_or(DisputeOutcome::FavorRespondent),
    };

    // ── Slash non-voters ───────────────────────────────────────────────────
    let mut total_slashed: i128 = 0;
    for arbiter in assignment.arbiters.iter() {
        let assigned: AssignedArbiter = env
            .storage()
            .persistent()
            .get(&DataKey::AssignedArbiter(dispute_id.clone(), arbiter.clone()))
            .ok_or(DisputeError::ArbiterNotAssigned)?;
        if !assigned.voted {
            let slash = assigned.staked_snapshot * (assignment.slash_bps as i128) / BPS_DENOMINATOR;
            if slash > 0 {
                // `adjust_stake` returns the (negative) amount actually removed,
                // capped at the arbiter's available balance.
                let removed = -adjust_stake(env, &arbiter, -slash);
                if removed > 0 {
                    total_slashed += removed;
                    events::arbiter_slashed(env, dispute_id.clone(), arbiter.clone(), removed);
                }
            }
        }
    }

    // ── Redistribute the slashed total to participants by vote weight ──────
    if total_slashed > 0 && voted_weight > 0 {
        let mut distributed: i128 = 0;
        let mut first_voter: Option<Address> = None;
        for arbiter in assignment.arbiters.iter() {
            let assigned: AssignedArbiter = env
                .storage()
                .persistent()
                .get(&DataKey::AssignedArbiter(dispute_id.clone(), arbiter.clone()))
                .ok_or(DisputeError::ArbiterNotAssigned)?;
            if assigned.voted {
                if first_voter.is_none() {
                    first_voter = Some(arbiter.clone());
                }
                let reward = total_slashed * assigned.weight / voted_weight;
                if reward > 0 {
                    adjust_stake(env, &arbiter, reward);
                    distributed += reward;
                    events::slash_redistributed(env, dispute_id.clone(), arbiter.clone(), reward);
                }
            }
        }
        // Assign any integer-division remainder to the first participant so that
        // the total redistributed exactly equals the total slashed.
        let remainder = total_slashed - distributed;
        if remainder > 0 {
            if let Some(first) = first_voter {
                adjust_stake(env, &first, remainder);
                events::slash_redistributed(env, dispute_id.clone(), first, remainder);
            }
        }
    }

    assignment.finalized = true;
    assignment.outcome = OptionalOutcome::from_outcome(outcome.clone());
    env.storage().persistent().set(&assignment_key, &assignment);
    env.storage()
        .persistent()
        .extend_ttl(&assignment_key, 500000, 500000);

    // Mark the underlying dispute resolved for downstream consumers, if present.
    let dispute_key = DataKey::Dispute(dispute_id.clone());
    if let Some(mut dispute) = env
        .storage()
        .persistent()
        .get::<_, Dispute>(&dispute_key)
    {
        if !dispute.resolved {
            dispute.resolved = true;
            dispute.resolved_at = Some(now);
            env.storage().persistent().set(&dispute_key, &dispute);
            env.storage()
                .persistent()
                .extend_ttl(&dispute_key, 500000, 500000);
        }
    }

    events::dispute_finalized(env, dispute_id, outcome.clone(), voted_weight, total_slashed);

    Ok(outcome)
}

/// Return the current tally, quorum progress, and per-arbiter participation for a
/// dispute's staked-weighted vote.
pub fn get_dispute_tally(env: &Env, dispute_id: String) -> Result<DisputeTally, DisputeError> {
    let assignment: DisputeAssignment = env
        .storage()
        .persistent()
        .get(&DataKey::DisputeAssignment(dispute_id.clone()))
        .ok_or(DisputeError::DisputeNotFound)?;

    let mut voted_weight: i128 = 0;
    let mut w_claimant: i128 = 0;
    let mut w_respondent: i128 = 0;
    let mut participants = soroban_sdk::Vec::new(env);

    for arbiter in assignment.arbiters.iter() {
        let assigned: AssignedArbiter = env
            .storage()
            .persistent()
            .get(&DataKey::AssignedArbiter(dispute_id.clone(), arbiter.clone()))
            .ok_or(DisputeError::ArbiterNotAssigned)?;
        if assigned.voted {
            voted_weight += assigned.weight;
            match assigned.vote {
                OptionalOutcome::FavorClaimant => w_claimant += assigned.weight,
                OptionalOutcome::FavorRespondent => w_respondent += assigned.weight,
                OptionalOutcome::None => {}
            }
        }
        participants.push_back(ArbiterParticipation {
            arbiter: assigned.arbiter,
            weight: assigned.weight,
            voted: assigned.voted,
            vote: assigned.vote,
        });
    }

    Ok(DisputeTally {
        dispute_id,
        w_votes_claimant: w_claimant,
        w_votes_respondent: w_respondent,
        total_assigned_weight: assignment.total_weight,
        voted_weight,
        quorum_weight_required: assignment.quorum_weight_required,
        quorum_reached: voted_weight >= assignment.quorum_weight_required,
        finalized: assignment.finalized,
        outcome: assignment.outcome,
        participants,
    })
}

/// Read the assignment metadata for a dispute, if any.
pub fn get_dispute_assignment(env: &Env, dispute_id: String) -> Option<DisputeAssignment> {
    env.storage()
        .persistent()
        .get(&DataKey::DisputeAssignment(dispute_id))
}
