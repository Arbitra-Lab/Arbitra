#![no_std]

use soroban_sdk::{contract, contractimpl, Address, Env, String, Vec};

mod dispute;
mod errors;
mod events;
mod rate_limit;
mod storage;
mod types;
mod upgrade;

#[cfg(test)]
mod tests;

#[cfg(test)]
mod tests_raise_dispute;

#[cfg(test)]
mod tests_rate_limit;

#[cfg(test)]
mod tests_escrow_integration;

#[cfg(test)]
mod tests_staked_voting;

pub use dispute::{
    add_arbiter, assign_dispute_arbiters, calculate_voting_weight, cancel_appeal, cast_staked_vote,
    create_appeal, finalize_dispute, get_appeal, get_arbiter, get_arbiter_count, get_arbiter_stake,
    get_dispute, get_dispute_assignment, get_dispute_tally, get_dispute_votes_weighted,
    get_quorum_config, get_timeout_config, get_vote, get_voting_weight, raise_dispute,
    resolve_appeal, resolve_dispute, resolve_dispute_on_timeout, resolve_dispute_weighted,
    set_arbiter_stake, set_arbiter_stats, set_quorum_config, set_timeout_config, vote_on_appeal,
    vote_on_dispute, vote_on_dispute_weighted,
};
pub use errors::DisputeError;
pub use storage::DataKey;
pub use types::{
    AppealStatus, AppealVote, Arbiter, ArbiterParticipation, ArbiterStake, ArbiterStats,
    AssignedArbiter, ContractState, Dispute, DisputeAppeal, DisputeAssignment, DisputeOutcome,
    DisputeTally, OptionalOutcome, QuorumConfig, TimeoutConfig, Vote, VotingWeight,
    WeightedDisputeVotes, WeightedVote,
};

#[contract]
pub struct DisputeResolutionContract;

#[contractimpl]
impl DisputeResolutionContract {
    /// Initialize the contract with an admin address and minimum votes required.
    ///
    /// # Arguments
    /// * `admin` - The address that will have admin privileges to add arbiters
    /// * `min_votes_required` - Minimum number of votes required to resolve a dispute (default: 3)
    /// * `case_registry` - Address of the registry contract (escrow, freelance, trade-finance, insurance, ...) that owns this case's parties and status
    ///
    /// # Errors
    /// * `AlreadyInitialized` - If the contract has already been initialized
    pub fn initialize(
        env: Env,
        admin: Address,
        min_votes_required: u32,
        case_registry: Address,
    ) -> Result<(), DisputeError> {
        if env.storage().persistent().has(&DataKey::Initialized) {
            return Err(DisputeError::AlreadyInitialized);
        }

        admin.require_auth();

        env.storage().persistent().set(&DataKey::Initialized, &true);
        env.storage()
            .persistent()
            .extend_ttl(&DataKey::Initialized, 500000, 500000);

        let state = ContractState {
            admin: admin.clone(),
            initialized: true,
            min_votes_required,
            case_registry,
        };

        env.storage().instance().set(&DataKey::State, &state);
        env.storage().instance().extend_ttl(500000, 500000);

        events::contract_initialized(&env, admin, min_votes_required);

        Ok(())
    }

    /// Get the current contract state.
    ///
    /// # Returns
    /// * `Option<ContractState>` - The contract state if initialized
    pub fn get_state(env: Env) -> Option<ContractState> {
        env.storage().instance().get(&DataKey::State)
    }

    /// Add a verified arbiter to handle disputes (admin only).
    ///
    /// # Arguments
    /// * `admin` - The admin address performing the action
    /// * `arbiter` - The address of the arbiter to add
    ///
    /// # Errors
    /// * `NotInitialized` - If the contract hasn't been initialized
    /// * `Unauthorized` - If the caller is not the admin
    /// * `ArbiterAlreadyExists` - If the arbiter is already registered
    pub fn add_arbiter(env: Env, admin: Address, arbiter: Address) -> Result<(), DisputeError> {
        dispute::add_arbiter(&env, admin, arbiter)
    }

    /// Raise a dispute for a specific agreement.
    ///
    /// # Arguments
    /// * `raiser` - The address raising the dispute (must be the claimant or respondent)
    /// * `case_id` - Unique identifier for the agreement in dispute
    /// * `details_hash` - Hash reference to off-chain evidence/details (IPFS, etc.)
    ///
    /// # Errors
    /// * `NotInitialized` - If the contract hasn't been initialized
    /// * `DisputeAlreadyExists` - If a dispute already exists for this agreement
    /// * `InvalidDetailsHash` - If the details hash is empty
    /// * `Unauthorized` - If raiser is not a party to the agreement
    pub fn raise_dispute(
        env: Env,
        raiser: Address,
        case_id: String,
        details_hash: String,
    ) -> Result<(), DisputeError> {
        dispute::raise_dispute(&env, raiser, case_id, details_hash)
    }

    /// Vote on an existing dispute (arbiters only).
    ///
    /// # Arguments
    /// * `arbiter` - The address of the arbiter voting
    /// * `case_id` - The ID of the agreement in dispute
    /// * `favor_claimant` - True to vote in favor of the claimant, false for the respondent
    ///
    /// # Errors
    /// * `NotInitialized` - If the contract hasn't been initialized
    /// * `ArbiterNotFound` - If the arbiter doesn't exist or is inactive
    /// * `DisputeNotFound` - If the dispute doesn't exist
    /// * `DisputeAlreadyResolved` - If the dispute has already been resolved
    /// * `AlreadyVoted` - If this arbiter has already voted on this dispute
    pub fn vote_on_dispute(
        env: Env,
        arbiter: Address,
        case_id: String,
        favor_claimant: bool,
    ) -> Result<(), DisputeError> {
        dispute::vote_on_dispute(&env, arbiter, case_id, favor_claimant)
    }

    /// Resolve a dispute by evaluating votes and determining the outcome.
    ///
    /// # Arguments
    /// * `case_id` - The ID of the agreement in dispute
    ///
    /// # Returns
    /// * `DisputeOutcome` - The outcome of the dispute (FavorClaimant or FavorRespondent)
    ///
    /// # Errors
    /// * `NotInitialized` - If the contract hasn't been initialized
    /// * `DisputeNotFound` - If the dispute doesn't exist
    /// * `DisputeAlreadyResolved` - If the dispute has already been resolved
    /// * `InsufficientVotes` - If minimum required votes haven't been cast
    pub fn resolve_dispute(env: Env, case_id: String) -> Result<DisputeOutcome, DisputeError> {
        dispute::resolve_dispute(&env, case_id)
    }

    pub fn resolve_dispute_on_timeout(
        env: Env,
        case_id: String,
    ) -> Result<DisputeOutcome, DisputeError> {
        dispute::resolve_dispute_on_timeout(&env, case_id)
    }

    /// Get information about a specific dispute.
    ///
    /// # Arguments
    /// * `case_id` - The ID of the agreement in dispute
    ///
    /// # Returns
    /// * `Option<Dispute>` - The dispute information if it exists
    pub fn get_dispute(env: Env, case_id: String) -> Option<Dispute> {
        dispute::get_dispute(&env, case_id)
    }

    /// Get information about a specific arbiter.
    ///
    /// # Arguments
    /// * `arbiter` - The address of the arbiter
    ///
    /// # Returns
    /// * `Option<Arbiter>` - The arbiter information if they exist
    pub fn get_arbiter(env: Env, arbiter: Address) -> Option<Arbiter> {
        dispute::get_arbiter(&env, arbiter)
    }

    /// Get the total count of registered arbiters.
    ///
    /// # Returns
    /// * `u32` - The total number of arbiters
    pub fn get_arbiter_count(env: Env) -> u32 {
        dispute::get_arbiter_count(&env)
    }

    /// Get a specific vote for a dispute.
    ///
    /// # Arguments
    /// * `case_id` - The ID of the agreement in dispute
    /// * `arbiter` - The address of the arbiter who voted
    ///
    /// # Returns
    /// * `Option<Vote>` - The vote information if it exists
    pub fn get_vote(env: Env, case_id: String, arbiter: Address) -> Option<Vote> {
        dispute::get_vote(&env, case_id, arbiter)
    }

    pub fn set_timeout_config(
        env: Env,
        admin: Address,
        config: TimeoutConfig,
    ) -> Result<(), DisputeError> {
        dispute::set_timeout_config(&env, admin, config)
    }

    pub fn get_timeout_config(env: Env) -> TimeoutConfig {
        dispute::get_timeout_config(&env)
    }

    pub fn create_appeal(
        env: Env,
        appellant: Address,
        dispute_id: String,
        reason: String,
    ) -> Result<String, DisputeError> {
        dispute::create_appeal(&env, appellant, dispute_id, reason)
    }

    pub fn vote_on_appeal(
        env: Env,
        arbiter: Address,
        appeal_id: String,
        vote: DisputeOutcome,
    ) -> Result<(), DisputeError> {
        dispute::vote_on_appeal(&env, arbiter, appeal_id, vote)
    }

    pub fn resolve_appeal(env: Env, appeal_id: String) -> Result<(), DisputeError> {
        dispute::resolve_appeal(&env, appeal_id)
    }

    pub fn cancel_appeal(
        env: Env,
        appellant: Address,
        appeal_id: String,
    ) -> Result<(), DisputeError> {
        dispute::cancel_appeal(&env, appellant, appeal_id)
    }

    pub fn get_appeal(env: Env, appeal_id: String) -> Option<DisputeAppeal> {
        dispute::get_appeal(&env, appeal_id)
    }

    // ── Weighted Voting ────────────────────────────────────────────────────

    /// Set rating (0-100) and disputes-resolved count for an arbiter (admin only).
    pub fn set_arbiter_stats(
        env: Env,
        admin: Address,
        arbiter: Address,
        rating: u32,
        disputes_resolved: u32,
    ) -> Result<(), DisputeError> {
        dispute::set_arbiter_stats(&env, admin, arbiter, rating, disputes_resolved)
    }

    /// Return the computed voting weight for an arbiter.
    pub fn get_voting_weight(env: Env, arbiter: Address) -> Result<VotingWeight, DisputeError> {
        dispute::get_voting_weight(&env, arbiter)
    }

    /// Cast a weighted vote on an open dispute.
    pub fn vote_on_dispute_weighted(
        env: Env,
        arbiter: Address,
        dispute_id: String,
        vote: DisputeOutcome,
    ) -> Result<(), DisputeError> {
        dispute::vote_on_dispute_weighted(&env, arbiter, dispute_id, vote)
    }

    /// Resolve a dispute by weighted vote totals (ties broken by first vote).
    pub fn resolve_dispute_weighted(
        env: Env,
        dispute_id: String,
    ) -> Result<DisputeOutcome, DisputeError> {
        dispute::resolve_dispute_weighted(&env, dispute_id)
    }

    /// Return all weighted votes for a dispute.
    pub fn get_dispute_votes_weighted(
        env: Env,
        dispute_id: String,
    ) -> Result<Vec<WeightedVote>, DisputeError> {
        dispute::get_dispute_votes_weighted(&env, dispute_id)
    }

    // ── Staked Weighted Voting: quorum + slashing ──────────────────────────

    /// Read the current quorum/slash configuration (basis points).
    pub fn get_quorum_config(env: Env) -> QuorumConfig {
        dispute::get_quorum_config(&env)
    }

    /// Set the quorum/slash configuration (admin only). Both values are basis
    /// points; `quorum_bps` must be in 1..=10000 and `slash_bps` in 0..=10000.
    pub fn set_quorum_config(
        env: Env,
        admin: Address,
        config: QuorumConfig,
    ) -> Result<(), DisputeError> {
        dispute::set_quorum_config(&env, admin, config)
    }

    /// Set an arbiter's stake and reputation multiplier (admin only).
    /// `reputation_multiplier` is scaled ×100 (100 = 1.00×).
    pub fn set_arbiter_stake(
        env: Env,
        admin: Address,
        arbiter: Address,
        staked_amount: i128,
        reputation_multiplier: u32,
    ) -> Result<(), DisputeError> {
        dispute::set_arbiter_stake(&env, admin, arbiter, staked_amount, reputation_multiplier)
    }

    /// Read an arbiter's stake profile.
    pub fn get_arbiter_stake(env: Env, arbiter: Address) -> ArbiterStake {
        dispute::get_arbiter_stake(&env, arbiter)
    }

    /// Assign arbiters to a dispute, snapshotting their stake-derived weights and
    /// the quorum/slash parameters (admin only). Pass `voting_window_seconds = 0`
    /// to use the default window.
    pub fn assign_dispute_arbiters(
        env: Env,
        admin: Address,
        dispute_id: String,
        arbiters: Vec<Address>,
        voting_window_seconds: u64,
    ) -> Result<(), DisputeError> {
        dispute::assign_dispute_arbiters(&env, admin, dispute_id, arbiters, voting_window_seconds)
    }

    /// Cast a staked-weighted vote on an assigned dispute (assigned arbiters only).
    pub fn cast_staked_vote(
        env: Env,
        arbiter: Address,
        dispute_id: String,
        vote: DisputeOutcome,
    ) -> Result<(), DisputeError> {
        dispute::cast_staked_vote(&env, arbiter, dispute_id, vote)
    }

    /// Finalize a dispute once the deadline has passed and quorum has voted,
    /// slashing non-voters and redistributing to participants.
    pub fn finalize_dispute(env: Env, dispute_id: String) -> Result<DisputeOutcome, DisputeError> {
        dispute::finalize_dispute(&env, dispute_id)
    }

    /// Return the tally, quorum progress, and per-arbiter participation for a dispute.
    pub fn get_dispute_tally(env: Env, dispute_id: String) -> Result<DisputeTally, DisputeError> {
        dispute::get_dispute_tally(&env, dispute_id)
    }

    /// Read the assignment metadata for a dispute, if any.
    pub fn get_dispute_assignment(env: Env, dispute_id: String) -> Option<DisputeAssignment> {
        dispute::get_dispute_assignment(&env, dispute_id)
    }

    // --- Upgrade Functions ---

    /// Propose a contract upgrade (admin only).
    pub fn propose_upgrade(
        env: Env,
        proposer: Address,
        proposal_id: String,
        wasm_hash: soroban_sdk::Bytes,
        notes: String,
        delay_seconds: u64,
    ) -> Result<(), DisputeError> {
        upgrade::propose_upgrade(&env, proposer, proposal_id, wasm_hash, notes, delay_seconds)
    }

    /// Approve an upgrade proposal (admin only).
    pub fn approve_upgrade(
        env: Env,
        approver: Address,
        proposal_id: String,
    ) -> Result<(), DisputeError> {
        upgrade::approve_upgrade(&env, approver, proposal_id)
    }

    /// Execute an approved upgrade (admin only).
    pub fn execute_upgrade(
        env: Env,
        executor: Address,
        proposal_id: String,
    ) -> Result<(), DisputeError> {
        upgrade::execute_upgrade(&env, executor, proposal_id)
    }

    /// Get an upgrade proposal.
    pub fn get_upgrade_proposal(
        env: Env,
        proposal_id: String,
    ) -> Result<upgrade::UpgradeProposal, DisputeError> {
        upgrade::get_upgrade_proposal(&env, proposal_id)
    }
}
