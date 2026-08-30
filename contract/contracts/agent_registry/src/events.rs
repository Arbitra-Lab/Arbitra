use soroban_sdk::{contractevent, Address, Env, String};

use crate::types::OutcomeSignal;

#[contractevent(topics = ["initialized"])]
pub struct ContractInitialized {
    #[topic]
    pub admin: Address,
}

#[contractevent(topics = ["agent_registered"])]
pub struct AgentRegistered {
    #[topic]
    pub agent: Address,
    pub external_profile_hash: String,
}

#[contractevent(topics = ["agent_verified"])]
pub struct AgentVerified {
    #[topic]
    pub admin: Address,
    #[topic]
    pub agent: Address,
}

#[contractevent(topics = ["agent_rated"])]
pub struct AgentRated {
    #[topic]
    pub agent: Address,
    #[topic]
    pub rater: Address,
    pub score: u32,
}

#[contractevent(topics = ["transaction_registered"])]
pub struct TransactionRegistered {
    #[topic]
    pub transaction_id: String,
    #[topic]
    pub agent: Address,
}

#[contractevent(topics = ["stake_config_set"])]
pub struct StakeConfigSet {
    #[topic]
    pub admin: Address,
    pub token: Address,
    pub unbonding_period: u64,
}

#[contractevent(topics = ["stake_bonded"])]
pub struct StakeBonded {
    #[topic]
    pub agent: Address,
    pub amount: i128,
    pub total_staked: i128,
}

#[contractevent(topics = ["unbond_requested"])]
pub struct UnbondRequested {
    #[topic]
    pub agent: Address,
    pub amount: i128,
    pub available_at: u64,
}

#[contractevent(topics = ["stake_withdrawn"])]
pub struct StakeWithdrawn {
    #[topic]
    pub agent: Address,
    pub amount: i128,
}

#[contractevent(topics = ["agent_slashed"])]
pub struct AgentSlashed {
    #[topic]
    pub agent: Address,
    #[topic]
    pub admin: Address,
    pub stake_slashed: i128,
    pub reputation_slashed: u32,
    pub remaining_stake: i128,
    pub remaining_reputation: u32,
}

#[contractevent(topics = ["agent_rewarded"])]
pub struct AgentRewarded {
    #[topic]
    pub agent: Address,
    #[topic]
    pub admin: Address,
    pub stake_rewarded: i128,
    pub reputation_rewarded: u32,
    pub total_stake: i128,
    pub total_reputation: u32,
}

#[contractevent(topics = ["outcome_policy_set"])]
pub struct OutcomePolicySet {
    #[topic]
    pub admin: Address,
    pub settlement_reward: u32,
    pub dispute_rep_penalty: u32,
    pub dispute_stake_slash: i128,
}

#[contractevent(topics = ["outcome_reporter_added"])]
pub struct OutcomeReporterAdded {
    #[topic]
    pub admin: Address,
    #[topic]
    pub reporter: Address,
}

#[contractevent(topics = ["outcome_reporter_removed"])]
pub struct OutcomeReporterRemoved {
    #[topic]
    pub admin: Address,
    #[topic]
    pub reporter: Address,
}

#[contractevent(topics = ["outcome_reported"])]
pub struct OutcomeReported {
    #[topic]
    pub agent: Address,
    #[topic]
    pub reporter: Address,
    pub outcome: OutcomeSignal,
    pub transaction_id: String,
    pub stake_slashed: i128,
    pub reputation: u32,
}

pub(crate) fn contract_initialized(env: &Env, admin: Address) {
    ContractInitialized { admin }.publish(env);
}

pub(crate) fn agent_registered(env: &Env, agent: Address, external_profile_hash: String) {
    AgentRegistered {
        agent,
        external_profile_hash,
    }
    .publish(env);
}

pub(crate) fn agent_verified(env: &Env, admin: Address, agent: Address) {
    AgentVerified { admin, agent }.publish(env);
}

pub(crate) fn agent_rated(env: &Env, agent: Address, rater: Address, score: u32) {
    AgentRated {
        agent,
        rater,
        score,
    }
    .publish(env);
}

pub(crate) fn transaction_registered(env: &Env, transaction_id: String, agent: Address) {
    TransactionRegistered {
        transaction_id,
        agent,
    }
    .publish(env);
}

pub(crate) fn stake_config_set(env: &Env, admin: Address, token: Address, unbonding_period: u64) {
    StakeConfigSet {
        admin,
        token,
        unbonding_period,
    }
    .publish(env);
}

pub(crate) fn stake_bonded(env: &Env, agent: Address, amount: i128, total_staked: i128) {
    StakeBonded {
        agent,
        amount,
        total_staked,
    }
    .publish(env);
}

pub(crate) fn unbond_requested(env: &Env, agent: Address, amount: i128, available_at: u64) {
    UnbondRequested {
        agent,
        amount,
        available_at,
    }
    .publish(env);
}

pub(crate) fn stake_withdrawn(env: &Env, agent: Address, amount: i128) {
    StakeWithdrawn { agent, amount }.publish(env);
}

#[allow(clippy::too_many_arguments)]
pub(crate) fn agent_slashed(
    env: &Env,
    agent: Address,
    admin: Address,
    stake_slashed: i128,
    reputation_slashed: u32,
    remaining_stake: i128,
    remaining_reputation: u32,
) {
    AgentSlashed {
        agent,
        admin,
        stake_slashed,
        reputation_slashed,
        remaining_stake,
        remaining_reputation,
    }
    .publish(env);
}

#[allow(clippy::too_many_arguments)]
pub(crate) fn agent_rewarded(
    env: &Env,
    agent: Address,
    admin: Address,
    stake_rewarded: i128,
    reputation_rewarded: u32,
    total_stake: i128,
    total_reputation: u32,
) {
    AgentRewarded {
        agent,
        admin,
        stake_rewarded,
        reputation_rewarded,
        total_stake,
        total_reputation,
    }
    .publish(env);
}

pub(crate) fn outcome_policy_set(
    env: &Env,
    admin: Address,
    settlement_reward: u32,
    dispute_rep_penalty: u32,
    dispute_stake_slash: i128,
) {
    OutcomePolicySet {
        admin,
        settlement_reward,
        dispute_rep_penalty,
        dispute_stake_slash,
    }
    .publish(env);
}

pub(crate) fn outcome_reporter_added(env: &Env, admin: Address, reporter: Address) {
    OutcomeReporterAdded { admin, reporter }.publish(env);
}

pub(crate) fn outcome_reporter_removed(env: &Env, admin: Address, reporter: Address) {
    OutcomeReporterRemoved { admin, reporter }.publish(env);
}

pub(crate) fn outcome_reported(
    env: &Env,
    agent: Address,
    reporter: Address,
    outcome: OutcomeSignal,
    transaction_id: String,
    stake_slashed: i128,
    reputation: u32,
) {
    OutcomeReported {
        agent,
        reporter,
        outcome,
        transaction_id,
        stake_slashed,
        reputation,
    }
    .publish(env);
}
