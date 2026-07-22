use soroban_sdk::{token, Address, Env, String, Vec};

use crate::errors::AgentError;
use crate::events;
use crate::storage::DataKey;
use crate::types::{
    AgentInfo, AgentTransaction, ContractState, ReputationState, StakeConfig, StakeVault,
    MAX_REPUTATION_POINTS, MAX_STAKE_POINTS, REP_POINTS_PER_STAR, STAKE_STROOPS_PER_POINT,
};

const TTL_THRESHOLD: u32 = 500000;
const TTL_EXTEND_TO: u32 = 500000;

fn require_initialized(env: &Env) -> Result<(), AgentError> {
    if !env.storage().persistent().has(&DataKey::Initialized) {
        return Err(AgentError::NotInitialized);
    }
    Ok(())
}

fn require_admin(env: &Env, caller: &Address) -> Result<(), AgentError> {
    let state: ContractState = env
        .storage()
        .instance()
        .get(&DataKey::State)
        .ok_or(AgentError::NotInitialized)?;

    caller.require_auth();

    if *caller != state.admin {
        return Err(AgentError::Unauthorized);
    }
    Ok(())
}

fn require_registered(env: &Env, agent: &Address) -> Result<(), AgentError> {
    if !env
        .storage()
        .persistent()
        .has(&DataKey::Agent(agent.clone()))
    {
        return Err(AgentError::AgentNotFound);
    }
    Ok(())
}

fn get_stake_config(env: &Env) -> Result<StakeConfig, AgentError> {
    env.storage()
        .instance()
        .get(&DataKey::StakeConfig)
        .ok_or(AgentError::StakeConfigNotSet)
}

fn load_vault(env: &Env, agent: &Address) -> StakeVault {
    env.storage()
        .persistent()
        .get(&DataKey::Stake(agent.clone()))
        .unwrap_or_else(StakeVault::empty)
}

fn save_vault(env: &Env, agent: &Address, vault: &StakeVault) {
    let key = DataKey::Stake(agent.clone());
    env.storage().persistent().set(&key, vault);
    env.storage()
        .persistent()
        .extend_ttl(&key, TTL_THRESHOLD, TTL_EXTEND_TO);
}

fn load_reputation(env: &Env, agent: &Address) -> ReputationState {
    env.storage()
        .persistent()
        .get(&DataKey::Reputation(agent.clone()))
        .unwrap_or(ReputationState {
            points: 0,
            last_decay_ts: env.ledger().timestamp(),
        })
}

fn save_reputation(env: &Env, agent: &Address, rep: &ReputationState) {
    let key = DataKey::Reputation(agent.clone());
    env.storage().persistent().set(&key, rep);
    env.storage()
        .persistent()
        .extend_ttl(&key, TTL_THRESHOLD, TTL_EXTEND_TO);
}

pub fn register_agent(
    env: &Env,
    agent: Address,
    external_profile_hash: String,
) -> Result<(), AgentError> {
    if !env.storage().persistent().has(&DataKey::Initialized) {
        return Err(AgentError::NotInitialized);
    }

    agent.require_auth();

    if external_profile_hash.is_empty() {
        return Err(AgentError::InvalidProfileHash);
    }

    let key = DataKey::Agent(agent.clone());
    if env.storage().persistent().has(&key) {
        return Err(AgentError::AgentAlreadyRegistered);
    }

    let agent_info = AgentInfo {
        agent: agent.clone(),
        external_profile_hash: external_profile_hash.clone(),
        verified: false,
        registered_at: env.ledger().timestamp(),
        verified_at: None,
        total_ratings: 0,
        total_score: 0,
        completed_agreements: 0,
    };

    env.storage().persistent().set(&key, &agent_info);
    env.storage().persistent().extend_ttl(&key, 500000, 500000);

    let rep = ReputationState {
        points: 0,
        last_decay_ts: env.ledger().timestamp(),
    };
    save_reputation(env, &agent, &rep);

    let count_key = DataKey::AgentCount;
    let count: u32 = env.storage().persistent().get(&count_key).unwrap_or(0);
    env.storage().persistent().set(&count_key, &(count + 1));
    env.storage()
        .persistent()
        .extend_ttl(&count_key, 500000, 500000);

    events::agent_registered(env, agent, external_profile_hash);

    Ok(())
}

pub fn verify_agent(env: &Env, admin: Address, agent: Address) -> Result<(), AgentError> {
    let state: ContractState = env
        .storage()
        .instance()
        .get(&DataKey::State)
        .ok_or(AgentError::NotInitialized)?;

    admin.require_auth();

    if admin != state.admin {
        return Err(AgentError::Unauthorized);
    }

    let key = DataKey::Agent(agent.clone());
    let mut agent_info: AgentInfo = env
        .storage()
        .persistent()
        .get(&key)
        .ok_or(AgentError::AgentNotFound)?;

    if agent_info.verified {
        return Err(AgentError::AlreadyVerified);
    }

    agent_info.verified = true;
    agent_info.verified_at = Some(env.ledger().timestamp());

    env.storage().persistent().set(&key, &agent_info);
    env.storage().persistent().extend_ttl(&key, 500000, 500000);

    events::agent_verified(env, admin, agent);

    Ok(())
}

pub fn rate_agent(
    env: &Env,
    rater: Address,
    agent: Address,
    score: u32,
    transaction_id: String,
) -> Result<(), AgentError> {
    if !env.storage().persistent().has(&DataKey::Initialized) {
        return Err(AgentError::NotInitialized);
    }

    rater.require_auth();

    if !(1..=5).contains(&score) {
        return Err(AgentError::InvalidRatingScore);
    }

    let agent_key = DataKey::Agent(agent.clone());
    let mut agent_info: AgentInfo = env
        .storage()
        .persistent()
        .get(&agent_key)
        .ok_or(AgentError::AgentNotFound)?;

    if !agent_info.verified {
        return Err(AgentError::AgentNotVerified);
    }

    let txn_key = DataKey::Transaction(transaction_id.clone());
    let transaction: AgentTransaction = env
        .storage()
        .persistent()
        .get(&txn_key)
        .ok_or(AgentError::TransactionNotFound)?;

    if !transaction.completed {
        return Err(AgentError::TransactionNotCompleted);
    }

    if transaction.agent != agent {
        return Err(AgentError::AgentNotFound);
    }

    let mut is_party = false;
    for party in transaction.parties.iter() {
        if party == rater {
            is_party = true;
            break;
        }
    }

    if !is_party {
        return Err(AgentError::NotTransactionParty);
    }

    let rating_key = DataKey::AgentRating(agent.clone(), rater.clone());
    if env.storage().persistent().has(&rating_key) {
        return Err(AgentError::AlreadyRated);
    }

    env.storage().persistent().set(&rating_key, &true);
    env.storage()
        .persistent()
        .extend_ttl(&rating_key, 500000, 500000);

    agent_info.total_ratings += 1;
    agent_info.total_score += score;

    env.storage().persistent().set(&agent_key, &agent_info);
    env.storage()
        .persistent()
        .extend_ttl(&agent_key, 500000, 500000);

    // Settle pending decay, then accrue reputation for this rating.
    let now = env.ledger().timestamp();
    let mut rep = load_reputation(env, &agent);
    rep.settle(now);
    rep.points = rep
        .points
        .saturating_add(score.saturating_mul(REP_POINTS_PER_STAR))
        .min(MAX_REPUTATION_POINTS);
    save_reputation(env, &agent, &rep);

    events::agent_rated(env, agent, rater, score);

    Ok(())
}

pub fn get_agent_info(env: &Env, agent: Address) -> Option<AgentInfo> {
    let key = DataKey::Agent(agent);
    env.storage().persistent().get(&key)
}

pub fn get_agent_count(env: &Env) -> u32 {
    env.storage()
        .persistent()
        .get(&DataKey::AgentCount)
        .unwrap_or(0)
}

pub fn register_transaction(
    env: &Env,
    transaction_id: String,
    agent: Address,
    parties: Vec<Address>,
) -> Result<(), AgentError> {
    if !env.storage().persistent().has(&DataKey::Initialized) {
        return Err(AgentError::NotInitialized);
    }

    let agent_key = DataKey::Agent(agent.clone());
    if !env.storage().persistent().has(&agent_key) {
        return Err(AgentError::AgentNotFound);
    }

    let txn_key = DataKey::Transaction(transaction_id.clone());

    let transaction = AgentTransaction {
        transaction_id: transaction_id.clone(),
        agent: agent.clone(),
        parties,
        completed: false,
    };

    env.storage().persistent().set(&txn_key, &transaction);
    env.storage()
        .persistent()
        .extend_ttl(&txn_key, 500000, 500000);

    events::transaction_registered(env, transaction_id, agent);

    Ok(())
}

pub fn complete_transaction(
    env: &Env,
    transaction_id: String,
    agent: Address,
) -> Result<(), AgentError> {
    if !env.storage().persistent().has(&DataKey::Initialized) {
        return Err(AgentError::NotInitialized);
    }

    let txn_key = DataKey::Transaction(transaction_id.clone());
    let mut transaction: AgentTransaction = env
        .storage()
        .persistent()
        .get(&txn_key)
        .ok_or(AgentError::TransactionNotFound)?;

    if transaction.agent != agent {
        return Err(AgentError::Unauthorized);
    }

    transaction.completed = true;

    env.storage().persistent().set(&txn_key, &transaction);
    env.storage()
        .persistent()
        .extend_ttl(&txn_key, 500000, 500000);

    let agent_key = DataKey::Agent(agent);
    let mut agent_info: AgentInfo = env
        .storage()
        .persistent()
        .get(&agent_key)
        .ok_or(AgentError::AgentNotFound)?;

    agent_info.completed_agreements += 1;

    env.storage().persistent().set(&agent_key, &agent_info);
    env.storage()
        .persistent()
        .extend_ttl(&agent_key, 500000, 500000);

    Ok(())
}

// ─── Staking, reputation decay, slashing & rewards ───────────────────────────

/// Set (or update) the staking configuration. Admin only.
pub fn set_stake_config(
    env: &Env,
    admin: Address,
    token: Address,
    unbonding_period: u64,
) -> Result<(), AgentError> {
    require_admin(env, &admin)?;

    let config = StakeConfig {
        token: token.clone(),
        unbonding_period,
    };
    env.storage().instance().set(&DataKey::StakeConfig, &config);
    env.storage()
        .instance()
        .extend_ttl(TTL_THRESHOLD, TTL_EXTEND_TO);

    events::stake_config_set(env, admin, token, unbonding_period);

    Ok(())
}

pub fn get_stake_config_opt(env: &Env) -> Option<StakeConfig> {
    env.storage().instance().get(&DataKey::StakeConfig)
}

/// Bond `amount` of the configured token into the agent's stake vault.
pub fn bond(env: &Env, agent: Address, amount: i128) -> Result<(), AgentError> {
    require_initialized(env)?;
    agent.require_auth();

    if amount <= 0 {
        return Err(AgentError::InvalidAmount);
    }
    require_registered(env, &agent)?;
    let config = get_stake_config(env)?;

    let mut vault = load_vault(env, &agent);
    vault.staked = vault
        .staked
        .checked_add(amount)
        .ok_or(AgentError::MathOverflow)?;

    token::Client::new(env, &config.token).transfer(
        &agent,
        env.current_contract_address(),
        &amount,
    );

    save_vault(env, &agent, &vault);

    events::stake_bonded(env, agent, amount, vault.staked);

    Ok(())
}

/// Queue `amount` of live stake for withdrawal after the unbonding period.
///
/// Pending stake stays slashable but no longer counts toward the effective
/// score. A new request adds to the pending balance and restarts the
/// unbonding clock for the whole pending amount.
pub fn request_unbond(env: &Env, agent: Address, amount: i128) -> Result<(), AgentError> {
    require_initialized(env)?;
    agent.require_auth();

    if amount <= 0 {
        return Err(AgentError::InvalidAmount);
    }
    let config = get_stake_config(env)?;

    let mut vault = load_vault(env, &agent);
    if amount > vault.staked {
        return Err(AgentError::InsufficientStake);
    }

    vault.staked -= amount;
    vault.pending = vault
        .pending
        .checked_add(amount)
        .ok_or(AgentError::MathOverflow)?;
    vault.unbond_available_at = env
        .ledger()
        .timestamp()
        .saturating_add(config.unbonding_period);

    save_vault(env, &agent, &vault);

    events::unbond_requested(env, agent, amount, vault.unbond_available_at);

    Ok(())
}

/// Withdraw the pending stake once the unbonding period has elapsed.
pub fn withdraw(env: &Env, agent: Address) -> Result<(), AgentError> {
    require_initialized(env)?;
    agent.require_auth();

    let config = get_stake_config(env)?;

    let mut vault = load_vault(env, &agent);
    if vault.pending <= 0 {
        return Err(AgentError::NothingToWithdraw);
    }
    if env.ledger().timestamp() < vault.unbond_available_at {
        return Err(AgentError::UnbondingNotElapsed);
    }

    let amount = vault.pending;
    vault.pending = 0;

    token::Client::new(env, &config.token).transfer(
        &env.current_contract_address(),
        &agent,
        &amount,
    );

    save_vault(env, &agent, &vault);

    events::stake_withdrawn(env, agent, amount);

    Ok(())
}

/// Slash an agent's stake and reputation together. Admin only.
///
/// The whole invocation is atomic: if the vault cannot cover `stake_amount`
/// the call fails and reputation is left untouched. Stake is slashed from the
/// live balance first, then from the pending (unbonding) balance. Slashed
/// funds accumulate in the contract's slashed pool.
pub fn slash_agent(
    env: &Env,
    admin: Address,
    agent: Address,
    stake_amount: i128,
    rep_points: u32,
) -> Result<(), AgentError> {
    require_admin(env, &admin)?;
    require_registered(env, &agent)?;

    if stake_amount < 0 {
        return Err(AgentError::InvalidAmount);
    }

    let mut vault = load_vault(env, &agent);
    let total = vault
        .staked
        .checked_add(vault.pending)
        .ok_or(AgentError::MathOverflow)?;
    if stake_amount > total {
        return Err(AgentError::InsufficientStake);
    }

    let from_staked = stake_amount.min(vault.staked);
    vault.staked -= from_staked;
    vault.pending -= stake_amount - from_staked;

    let now = env.ledger().timestamp();
    let mut rep = load_reputation(env, &agent);
    rep.settle(now);
    rep.points = rep.points.saturating_sub(rep_points);

    save_vault(env, &agent, &vault);
    save_reputation(env, &agent, &rep);

    let pool: i128 = env
        .storage()
        .persistent()
        .get(&DataKey::SlashedPool)
        .unwrap_or(0);
    let pool = pool
        .checked_add(stake_amount)
        .ok_or(AgentError::MathOverflow)?;
    env.storage().persistent().set(&DataKey::SlashedPool, &pool);
    env.storage()
        .persistent()
        .extend_ttl(&DataKey::SlashedPool, TTL_THRESHOLD, TTL_EXTEND_TO);

    events::agent_slashed(
        env,
        agent,
        admin,
        stake_amount,
        rep_points,
        vault.staked + vault.pending,
        rep.points,
    );

    Ok(())
}

/// Reward an agent with stake and reputation together. Admin only.
///
/// `stake_amount` is transferred from the admin into the agent's live stake;
/// `rep_points` is added to the (decay-settled) reputation, capped at
/// `MAX_REPUTATION_POINTS`. Atomic: a failed token transfer reverts the
/// reputation change and vice versa.
pub fn reward_agent(
    env: &Env,
    admin: Address,
    agent: Address,
    stake_amount: i128,
    rep_points: u32,
) -> Result<(), AgentError> {
    require_admin(env, &admin)?;
    require_registered(env, &agent)?;

    if stake_amount < 0 {
        return Err(AgentError::InvalidAmount);
    }

    let mut vault = load_vault(env, &agent);
    if stake_amount > 0 {
        let config = get_stake_config(env)?;
        vault.staked = vault
            .staked
            .checked_add(stake_amount)
            .ok_or(AgentError::MathOverflow)?;
        token::Client::new(env, &config.token).transfer(
            &admin,
            env.current_contract_address(),
            &stake_amount,
        );
        save_vault(env, &agent, &vault);
    }

    let now = env.ledger().timestamp();
    let mut rep = load_reputation(env, &agent);
    rep.settle(now);
    rep.points = rep
        .points
        .saturating_add(rep_points)
        .min(MAX_REPUTATION_POINTS);
    save_reputation(env, &agent, &rep);

    events::agent_rewarded(
        env,
        agent,
        admin,
        stake_amount,
        rep_points,
        vault.staked,
        rep.points,
    );

    Ok(())
}

/// Current stake vault for an agent (zeroed vault if none exists).
pub fn get_stake(env: &Env, agent: Address) -> StakeVault {
    load_vault(env, &agent)
}

/// Reputation after lazily applying the documented decay curve. Read-only.
pub fn get_reputation(env: &Env, agent: Address) -> u32 {
    let rep: Option<ReputationState> = env.storage().persistent().get(&DataKey::Reputation(agent));
    match rep {
        Some(rep) => rep.decayed_points(env.ledger().timestamp()),
        None => 0,
    }
}

/// Combined ranking score: decayed reputation plus a capped live-stake bonus.
///
/// `effective_score = decayed_reputation
///     + min(staked / STAKE_STROOPS_PER_POINT, MAX_STAKE_POINTS)`
pub fn get_effective_score(env: &Env, agent: Address) -> u32 {
    let rep = get_reputation(env, agent.clone());
    let vault = load_vault(env, &agent);
    let stake_points = (vault.staked / STAKE_STROOPS_PER_POINT)
        .min(MAX_STAKE_POINTS as i128)
        .max(0) as u32;
    rep.saturating_add(stake_points)
}

/// Total stake slashed into the contract's pool so far.
pub fn get_slashed_pool(env: &Env) -> i128 {
    env.storage()
        .persistent()
        .get(&DataKey::SlashedPool)
        .unwrap_or(0)
}
