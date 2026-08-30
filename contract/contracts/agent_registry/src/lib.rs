#![no_std]

use soroban_sdk::{contract, contractimpl, Address, Env, String, Vec};

mod agent;
mod errors;
mod events;
mod storage;
mod types;
mod upgrade;

#[cfg(test)]
mod tests;

pub use agent::{
    add_outcome_reporter, bond, complete_transaction, get_agent_count, get_agent_info,
    get_effective_score, get_reputation, get_slashed_pool, get_slashing_history, get_stake,
    is_outcome_reporter, rate_agent, register_agent, register_transaction, remove_outcome_reporter,
    request_unbond, reward_agent, set_outcome_policy, set_stake_config, slash_agent, submit_outcome,
    verify_agent, withdraw,
};
pub use errors::AgentError;
pub use storage::DataKey;
pub use types::{
    AgentInfo, AgentTransaction, ContractState, OutcomePolicy, OutcomeSignal, ReputationState,
    SlashReason, SlashRecord, StakeConfig, StakeVault,
};

#[contract]
pub struct AgentRegistryContract;

#[contractimpl]
impl AgentRegistryContract {
    /// Initialize the contract with an admin address.
    ///
    /// # Arguments
    /// * `admin` - The address that will have admin privileges to verify agents
    ///
    /// # Errors
    /// * `AlreadyInitialized` - If the contract has already been initialized
    pub fn initialize(env: Env, admin: Address) -> Result<(), AgentError> {
        if env.storage().persistent().has(&DataKey::Initialized) {
            return Err(AgentError::AlreadyInitialized);
        }

        admin.require_auth();

        env.storage().persistent().set(&DataKey::Initialized, &true);
        env.storage()
            .persistent()
            .extend_ttl(&DataKey::Initialized, 500000, 500000);

        let state = ContractState {
            admin: admin.clone(),
            initialized: true,
        };

        env.storage().instance().set(&DataKey::State, &state);
        env.storage().instance().extend_ttl(500000, 500000);

        events::contract_initialized(&env, admin);

        Ok(())
    }

    /// Get the current contract state.
    ///
    /// # Returns
    /// * `Option<ContractState>` - The contract state if initialized
    pub fn get_state(env: Env) -> Option<ContractState> {
        env.storage().instance().get(&DataKey::State)
    }

    /// Register a new agent on-chain.
    ///
    /// # Arguments
    /// * `agent` - The address of the agent registering
    /// * `external_profile_hash` - Hash reference to agent's external profile (IPFS, etc.)
    ///
    /// # Errors
    /// * `NotInitialized` - If the contract hasn't been initialized
    /// * `AgentAlreadyRegistered` - If the agent is already registered
    /// * `InvalidProfileHash` - If the profile hash is empty
    pub fn register_agent(
        env: Env,
        agent: Address,
        external_profile_hash: String,
    ) -> Result<(), AgentError> {
        agent::register_agent(&env, agent, external_profile_hash)
    }

    /// Verify a registered agent (admin only).
    ///
    /// # Arguments
    /// * `admin` - The admin address performing the verification
    /// * `agent` - The address of the agent to verify
    ///
    /// # Errors
    /// * `NotInitialized` - If the contract hasn't been initialized
    /// * `Unauthorized` - If the caller is not the admin
    /// * `AgentNotFound` - If the agent doesn't exist
    /// * `AlreadyVerified` - If the agent is already verified
    pub fn verify_agent(env: Env, admin: Address, agent: Address) -> Result<(), AgentError> {
        agent::verify_agent(&env, admin, agent)
    }

    /// Rate an agent after completing a transaction (1-5 stars).
    ///
    /// # Arguments
    /// * `rater` - The address of the person rating (tenant or landlord)
    /// * `agent` - The address of the agent being rated
    /// * `score` - The rating score (1-5)
    /// * `transaction_id` - The ID of the completed transaction
    ///
    /// # Errors
    /// * `NotInitialized` - If the contract hasn't been initialized
    /// * `InvalidRatingScore` - If score is not between 1 and 5
    /// * `AgentNotFound` - If the agent doesn't exist
    /// * `AgentNotVerified` - If the agent is not verified
    /// * `TransactionNotFound` - If the transaction doesn't exist
    /// * `TransactionNotCompleted` - If the transaction is not marked as completed
    /// * `NotTransactionParty` - If the rater wasn't part of the transaction
    /// * `AlreadyRated` - If the rater has already rated this agent
    pub fn rate_agent(
        env: Env,
        rater: Address,
        agent: Address,
        score: u32,
        transaction_id: String,
    ) -> Result<(), AgentError> {
        agent::rate_agent(&env, rater, agent, score, transaction_id)
    }

    /// Get information about a registered agent.
    ///
    /// # Arguments
    /// * `agent` - The address of the agent
    ///
    /// # Returns
    /// * `Option<AgentInfo>` - The agent information if they exist
    pub fn get_agent_info(env: Env, agent: Address) -> Option<AgentInfo> {
        agent::get_agent_info(&env, agent)
    }

    /// Get the total count of registered agents.
    ///
    /// # Returns
    /// * `u32` - The total number of agents registered
    pub fn get_agent_count(env: Env) -> u32 {
        agent::get_agent_count(&env)
    }

    /// Register a transaction involving an agent.
    /// This is called when a rent agreement or property transaction is created.
    ///
    /// # Arguments
    /// * `transaction_id` - Unique identifier for the transaction
    /// * `agent` - The agent involved in the transaction
    /// * `parties` - Vector of addresses involved (tenant, landlord, etc.)
    ///
    /// # Errors
    /// * `NotInitialized` - If the contract hasn't been initialized
    /// * `AgentNotFound` - If the agent doesn't exist
    pub fn register_transaction(
        env: Env,
        transaction_id: String,
        agent: Address,
        parties: Vec<Address>,
    ) -> Result<(), AgentError> {
        agent::register_transaction(&env, transaction_id, agent, parties)
    }

    /// Mark a transaction as completed.
    /// This enables the parties to rate the agent.
    ///
    /// # Arguments
    /// * `transaction_id` - The ID of the transaction to complete
    /// * `agent` - The agent address (for verification)
    ///
    /// # Errors
    /// * `NotInitialized` - If the contract hasn't been initialized
    /// * `TransactionNotFound` - If the transaction doesn't exist
    /// * `Unauthorized` - If the caller is not the agent for this transaction
    pub fn complete_transaction(
        env: Env,
        transaction_id: String,
        agent: Address,
    ) -> Result<(), AgentError> {
        agent::complete_transaction(&env, transaction_id, agent)
    }

    // --- Staking, Reputation Decay, Slashing & Rewards ---

    /// Set or update the staking configuration (admin only).
    ///
    /// # Arguments
    /// * `admin` - The admin address
    /// * `token` - Token used for bonding stake
    /// * `unbonding_period` - Seconds between an unbond request and withdrawal
    ///
    /// # Errors
    /// * `NotInitialized` - If the contract hasn't been initialized
    /// * `Unauthorized` - If the caller is not the admin
    pub fn set_stake_config(
        env: Env,
        admin: Address,
        token: Address,
        unbonding_period: u64,
    ) -> Result<(), AgentError> {
        agent::set_stake_config(&env, admin, token, unbonding_period)
    }

    /// Get the current staking configuration, if set.
    pub fn get_stake_config(env: Env) -> Option<StakeConfig> {
        agent::get_stake_config_opt(&env)
    }

    /// Bond tokens into the agent's stake vault (slashable balance).
    ///
    /// # Errors
    /// * `NotInitialized` - If the contract hasn't been initialized
    /// * `InvalidAmount` - If `amount` is not positive
    /// * `AgentNotFound` - If the agent isn't registered
    /// * `StakeConfigNotSet` - If staking hasn't been configured
    pub fn bond(env: Env, agent: Address, amount: i128) -> Result<(), AgentError> {
        agent::bond(&env, agent, amount)
    }

    /// Queue live stake for withdrawal after the unbonding period.
    /// Pending stake remains slashable but stops counting toward the
    /// effective score. A new request restarts the unbonding clock for the
    /// whole pending amount.
    ///
    /// # Errors
    /// * `InvalidAmount` - If `amount` is not positive
    /// * `InsufficientStake` - If `amount` exceeds the live staked balance
    /// * `StakeConfigNotSet` - If staking hasn't been configured
    pub fn request_unbond(env: Env, agent: Address, amount: i128) -> Result<(), AgentError> {
        agent::request_unbond(&env, agent, amount)
    }

    /// Withdraw the pending stake once the unbonding period has elapsed.
    ///
    /// # Errors
    /// * `NothingToWithdraw` - If there is no pending stake
    /// * `UnbondingNotElapsed` - If the unbonding period hasn't passed yet
    pub fn withdraw(env: Env, agent: Address) -> Result<(), AgentError> {
        agent::withdraw(&env, agent)
    }

    /// Slash an agent's stake and reputation atomically (admin only).
    /// Slashes the live balance first, then the pending balance; slashed
    /// funds accumulate in the contract's slashed pool.
    ///
    /// # Errors
    /// * `Unauthorized` - If the caller is not the admin
    /// * `AgentNotFound` - If the agent isn't registered
    /// * `InvalidAmount` - If `stake_amount` is negative
    /// * `InsufficientStake` - If `stake_amount` exceeds staked + pending
    pub fn slash_agent(
        env: Env,
        admin: Address,
        agent: Address,
        stake_amount: i128,
        rep_points: u32,
    ) -> Result<(), AgentError> {
        agent::slash_agent(&env, admin, agent, stake_amount, rep_points)
    }

    /// Reward an agent with stake (transferred from the admin) and
    /// reputation points atomically (admin only). Reputation is capped at
    /// `MAX_REPUTATION_POINTS`.
    ///
    /// # Errors
    /// * `Unauthorized` - If the caller is not the admin
    /// * `AgentNotFound` - If the agent isn't registered
    /// * `InvalidAmount` - If `stake_amount` is negative
    /// * `StakeConfigNotSet` - If staking is used but not configured
    pub fn reward_agent(
        env: Env,
        admin: Address,
        agent: Address,
        stake_amount: i128,
        rep_points: u32,
    ) -> Result<(), AgentError> {
        agent::reward_agent(&env, admin, agent, stake_amount, rep_points)
    }

    /// Get an agent's stake vault (zeroed vault if none exists).
    pub fn get_stake(env: Env, agent: Address) -> StakeVault {
        agent::get_stake(&env, agent)
    }

    /// Get an agent's reputation with decay applied lazily at read time.
    pub fn get_reputation(env: Env, agent: Address) -> u32 {
        agent::get_reputation(&env, agent)
    }

    /// Get the combined ranking score: decayed reputation plus a capped
    /// live-stake bonus. Used for arbiter ranking/selection.
    pub fn get_effective_score(env: Env, agent: Address) -> u32 {
        agent::get_effective_score(&env, agent)
    }

    /// Get the total amount of stake slashed into the contract's pool.
    pub fn get_slashed_pool(env: Env) -> i128 {
        agent::get_slashed_pool(&env)
    }

    // --- Outcome Signals: Reputation & Slashing on Transaction Outcomes ---

    /// Set or update the outcome policy (admin only): the reputation reward on
    /// settlement and the reputation penalty / stake slash on a dispute loss.
    ///
    /// # Errors
    /// * `Unauthorized` - If the caller is not the admin
    /// * `InvalidAmount` - If `dispute_stake_slash` is negative
    pub fn set_outcome_policy(
        env: Env,
        admin: Address,
        settlement_reward: u32,
        dispute_rep_penalty: u32,
        dispute_stake_slash: i128,
    ) -> Result<(), AgentError> {
        agent::set_outcome_policy(
            &env,
            admin,
            settlement_reward,
            dispute_rep_penalty,
            dispute_stake_slash,
        )
    }

    /// Get the current outcome policy, if configured.
    pub fn get_outcome_policy(env: Env) -> Option<OutcomePolicy> {
        agent::get_outcome_policy_opt(&env)
    }

    /// Authorize an address to submit outcome signals (admin only).
    ///
    /// # Errors
    /// * `Unauthorized` - If the caller is not the admin
    pub fn add_outcome_reporter(
        env: Env,
        admin: Address,
        reporter: Address,
    ) -> Result<(), AgentError> {
        agent::add_outcome_reporter(&env, admin, reporter)
    }

    /// Revoke an address's authorization to submit outcome signals (admin only).
    ///
    /// # Errors
    /// * `Unauthorized` - If the caller is not the admin
    pub fn remove_outcome_reporter(
        env: Env,
        admin: Address,
        reporter: Address,
    ) -> Result<(), AgentError> {
        agent::remove_outcome_reporter(&env, admin, reporter)
    }

    /// Whether an address is currently an authorized outcome reporter.
    pub fn is_outcome_reporter(env: Env, reporter: Address) -> bool {
        agent::is_outcome_reporter(&env, reporter)
    }

    /// Submit an outcome signal for an agent (admin or authorized reporter).
    /// A settlement accrues reputation; a dispute loss lowers reputation and
    /// slashes the agent's bond per the outcome policy, recording the slash.
    ///
    /// # Errors
    /// * `Unauthorized` - If the caller is not the admin or an authorized reporter
    /// * `AgentNotFound` - If the agent isn't registered
    /// * `OutcomePolicyNotSet` - If the outcome policy hasn't been configured
    pub fn submit_outcome(
        env: Env,
        caller: Address,
        agent: Address,
        transaction_id: String,
        outcome: OutcomeSignal,
    ) -> Result<(), AgentError> {
        agent::submit_outcome(&env, caller, agent, transaction_id, outcome)
    }

    /// Get an agent's slashing history (oldest first).
    pub fn get_slashing_history(env: Env, agent: Address) -> Vec<SlashRecord> {
        agent::get_slashing_history(&env, agent)
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
    ) -> Result<(), AgentError> {
        upgrade::propose_upgrade(&env, proposer, proposal_id, wasm_hash, notes, delay_seconds)
    }

    /// Approve an upgrade proposal (admin only).
    pub fn approve_upgrade(
        env: Env,
        approver: Address,
        proposal_id: String,
    ) -> Result<(), AgentError> {
        upgrade::approve_upgrade(&env, approver, proposal_id)
    }

    /// Execute an approved upgrade (admin only).
    pub fn execute_upgrade(
        env: Env,
        executor: Address,
        proposal_id: String,
    ) -> Result<(), AgentError> {
        upgrade::execute_upgrade(&env, executor, proposal_id)
    }

    /// Get an upgrade proposal.
    pub fn get_upgrade_proposal(
        env: Env,
        proposal_id: String,
    ) -> Result<upgrade::UpgradeProposal, AgentError> {
        upgrade::get_upgrade_proposal(&env, proposal_id)
    }
}
