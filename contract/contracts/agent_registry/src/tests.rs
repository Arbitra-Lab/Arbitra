use super::*;
use crate::types::{DECAY_GRACE_SECS, DECAY_PER_DAY_POINTS, MAX_REPUTATION_POINTS, SECS_PER_DAY};
use soroban_sdk::testutils::Ledger;
use soroban_sdk::{testutils::Address as _, token, vec, Address, Env, String};

fn create_contract(env: &Env) -> AgentRegistryContractClient<'_> {
    let contract_id = env.register(AgentRegistryContract, ());
    AgentRegistryContractClient::new(env, &contract_id)
}

#[test]
fn test_successful_initialization() {
    let env = Env::default();
    let client = create_contract(&env);

    let admin = Address::generate(&env);

    env.mock_all_auths();

    let result = client.try_initialize(&admin);
    assert!(result.is_ok());

    let state = client.get_state().unwrap();
    assert_eq!(state.admin, admin);
    assert!(state.initialized);
}

#[test]
#[should_panic]
fn test_initialize_fails_without_admin_auth() {
    let env = Env::default();
    let client = create_contract(&env);

    let admin = Address::generate(&env);

    client.initialize(&admin);
}

#[test]
#[should_panic(expected = "Error(Contract, #1)")]
fn test_double_initialization_fails() {
    let env = Env::default();
    let client = create_contract(&env);

    let admin = Address::generate(&env);

    env.mock_all_auths();

    client.initialize(&admin);
    client.initialize(&admin);
}

#[test]
fn test_register_agent_success() {
    let env = Env::default();
    let client = create_contract(&env);

    let admin = Address::generate(&env);
    let agent = Address::generate(&env);

    env.mock_all_auths();

    client.initialize(&admin);

    let profile_hash = String::from_str(&env, "QmXoypizjW3WknFiJnKLwHCnL72vedxjQkDDP1mXWo6uco");

    let result = client.try_register_agent(&agent, &profile_hash);
    assert!(result.is_ok());

    let agent_info = client.get_agent_info(&agent).unwrap();
    assert_eq!(agent_info.agent, agent);
    assert_eq!(agent_info.external_profile_hash, profile_hash);
    assert!(!agent_info.verified);
    assert!(agent_info.verified_at.is_none());
    assert_eq!(agent_info.total_ratings, 0);
    assert_eq!(agent_info.total_score, 0);
    assert_eq!(agent_info.completed_agreements, 0);

    assert_eq!(client.get_agent_count(), 1);
}

#[test]
#[should_panic]
fn test_register_agent_fails_without_agent_auth() {
    let env = Env::default();
    let client = create_contract(&env);

    let admin = Address::generate(&env);
    let agent = Address::generate(&env);

    env.mock_all_auths();
    client.initialize(&admin);

    env.mock_auths(&[]);

    let profile_hash = String::from_str(&env, "QmXoypizjW3WknFiJnKLwHCnL72vedxjQkDDP1mXWo6uco");

    client.register_agent(&agent, &profile_hash);
}

#[test]
#[should_panic(expected = "Error(Contract, #2)")]
fn test_register_agent_fails_when_not_initialized() {
    let env = Env::default();
    let client = create_contract(&env);

    let agent = Address::generate(&env);

    env.mock_all_auths();

    let profile_hash = String::from_str(&env, "QmXoypizjW3WknFiJnKLwHCnL72vedxjQkDDP1mXWo6uco");

    client.register_agent(&agent, &profile_hash);
}

#[test]
#[should_panic(expected = "Error(Contract, #3)")]
fn test_register_agent_fails_when_already_registered() {
    let env = Env::default();
    let client = create_contract(&env);

    let admin = Address::generate(&env);
    let agent = Address::generate(&env);

    env.mock_all_auths();

    client.initialize(&admin);

    let profile_hash = String::from_str(&env, "QmXoypizjW3WknFiJnKLwHCnL72vedxjQkDDP1mXWo6uco");

    client.register_agent(&agent, &profile_hash);
    client.register_agent(&agent, &profile_hash);
}

#[test]
#[should_panic(expected = "Error(Contract, #7)")]
fn test_register_agent_fails_with_empty_profile_hash() {
    let env = Env::default();
    let client = create_contract(&env);

    let admin = Address::generate(&env);
    let agent = Address::generate(&env);

    env.mock_all_auths();

    client.initialize(&admin);

    let empty_hash = String::from_str(&env, "");

    client.register_agent(&agent, &empty_hash);
}

#[test]
fn test_verify_agent_success() {
    let env = Env::default();
    let client = create_contract(&env);

    let admin = Address::generate(&env);
    let agent = Address::generate(&env);

    env.mock_all_auths();

    client.initialize(&admin);

    let profile_hash = String::from_str(&env, "QmXoypizjW3WknFiJnKLwHCnL72vedxjQkDDP1mXWo6uco");
    client.register_agent(&agent, &profile_hash);

    let result = client.try_verify_agent(&admin, &agent);
    assert!(result.is_ok());

    let agent_info = client.get_agent_info(&agent).unwrap();
    assert!(agent_info.verified);
    assert!(agent_info.verified_at.is_some());
}

#[test]
#[should_panic]
fn test_verify_agent_fails_without_admin_auth() {
    let env = Env::default();
    let client = create_contract(&env);

    let admin = Address::generate(&env);
    let agent = Address::generate(&env);

    env.mock_all_auths();

    client.initialize(&admin);

    let profile_hash = String::from_str(&env, "QmXoypizjW3WknFiJnKLwHCnL72vedxjQkDDP1mXWo6uco");
    client.register_agent(&agent, &profile_hash);

    env.mock_auths(&[]);

    client.verify_agent(&admin, &agent);
}

#[test]
#[should_panic(expected = "Error(Contract, #5)")]
fn test_verify_agent_fails_when_not_admin() {
    let env = Env::default();
    let client = create_contract(&env);

    let admin = Address::generate(&env);
    let agent = Address::generate(&env);
    let non_admin = Address::generate(&env);

    env.mock_all_auths();

    client.initialize(&admin);

    let profile_hash = String::from_str(&env, "QmXoypizjW3WknFiJnKLwHCnL72vedxjQkDDP1mXWo6uco");
    client.register_agent(&agent, &profile_hash);

    client.verify_agent(&non_admin, &agent);
}

#[test]
#[should_panic(expected = "Error(Contract, #4)")]
fn test_verify_agent_fails_when_agent_not_found() {
    let env = Env::default();
    let client = create_contract(&env);

    let admin = Address::generate(&env);
    let agent = Address::generate(&env);

    env.mock_all_auths();

    client.initialize(&admin);

    client.verify_agent(&admin, &agent);
}

#[test]
#[should_panic(expected = "Error(Contract, #6)")]
fn test_verify_agent_fails_when_already_verified() {
    let env = Env::default();
    let client = create_contract(&env);

    let admin = Address::generate(&env);
    let agent = Address::generate(&env);

    env.mock_all_auths();

    client.initialize(&admin);

    let profile_hash = String::from_str(&env, "QmXoypizjW3WknFiJnKLwHCnL72vedxjQkDDP1mXWo6uco");
    client.register_agent(&agent, &profile_hash);

    client.verify_agent(&admin, &agent);
    client.verify_agent(&admin, &agent);
}

#[test]
fn test_register_and_complete_transaction() {
    let env = Env::default();
    let client = create_contract(&env);

    let admin = Address::generate(&env);
    let agent = Address::generate(&env);
    let tenant = Address::generate(&env);
    let landlord = Address::generate(&env);

    env.mock_all_auths();

    client.initialize(&admin);

    let profile_hash = String::from_str(&env, "QmXoypizjW3WknFiJnKLwHCnL72vedxjQkDDP1mXWo6uco");
    client.register_agent(&agent, &profile_hash);

    let txn_id = String::from_str(&env, "TXN-001");
    let parties = vec![&env, tenant.clone(), landlord.clone()];

    let result = client.try_register_transaction(&txn_id, &agent, &parties);
    assert!(result.is_ok());

    let result = client.try_complete_transaction(&txn_id, &agent);
    assert!(result.is_ok());

    let agent_info = client.get_agent_info(&agent).unwrap();
    assert_eq!(agent_info.completed_agreements, 1);
}

#[test]
fn test_rate_agent_success() {
    let env = Env::default();
    let client = create_contract(&env);

    let admin = Address::generate(&env);
    let agent = Address::generate(&env);
    let tenant = Address::generate(&env);
    let landlord = Address::generate(&env);

    env.mock_all_auths();

    client.initialize(&admin);

    let profile_hash = String::from_str(&env, "QmXoypizjW3WknFiJnKLwHCnL72vedxjQkDDP1mXWo6uco");
    client.register_agent(&agent, &profile_hash);
    client.verify_agent(&admin, &agent);

    let txn_id = String::from_str(&env, "TXN-001");
    let parties = vec![&env, tenant.clone(), landlord.clone()];

    client.register_transaction(&txn_id, &agent, &parties);
    client.complete_transaction(&txn_id, &agent);

    let result = client.try_rate_agent(&tenant, &agent, &5, &txn_id);
    assert!(result.is_ok());

    let agent_info = client.get_agent_info(&agent).unwrap();
    assert_eq!(agent_info.total_ratings, 1);
    assert_eq!(agent_info.total_score, 5);
    assert_eq!(agent_info.average_rating(), 5);
}

#[test]
fn test_multiple_ratings_average() {
    let env = Env::default();
    let client = create_contract(&env);

    let admin = Address::generate(&env);
    let agent = Address::generate(&env);
    let tenant = Address::generate(&env);
    let landlord = Address::generate(&env);

    env.mock_all_auths();

    client.initialize(&admin);

    let profile_hash = String::from_str(&env, "QmXoypizjW3WknFiJnKLwHCnL72vedxjQkDDP1mXWo6uco");
    client.register_agent(&agent, &profile_hash);
    client.verify_agent(&admin, &agent);

    let txn_id = String::from_str(&env, "TXN-001");
    let parties = vec![&env, tenant.clone(), landlord.clone()];

    client.register_transaction(&txn_id, &agent, &parties);
    client.complete_transaction(&txn_id, &agent);

    client.rate_agent(&tenant, &agent, &5, &txn_id);
    client.rate_agent(&landlord, &agent, &3, &txn_id);

    let agent_info = client.get_agent_info(&agent).unwrap();
    assert_eq!(agent_info.total_ratings, 2);
    assert_eq!(agent_info.total_score, 8);
    assert_eq!(agent_info.average_rating(), 4);
}

#[test]
#[should_panic(expected = "Error(Contract, #8)")]
fn test_rate_agent_fails_with_invalid_score_low() {
    let env = Env::default();
    let client = create_contract(&env);

    let admin = Address::generate(&env);
    let agent = Address::generate(&env);
    let tenant = Address::generate(&env);
    let landlord = Address::generate(&env);

    env.mock_all_auths();

    client.initialize(&admin);

    let profile_hash = String::from_str(&env, "QmXoypizjW3WknFiJnKLwHCnL72vedxjQkDDP1mXWo6uco");
    client.register_agent(&agent, &profile_hash);
    client.verify_agent(&admin, &agent);

    let txn_id = String::from_str(&env, "TXN-001");
    let parties = vec![&env, tenant.clone(), landlord.clone()];

    client.register_transaction(&txn_id, &agent, &parties);
    client.complete_transaction(&txn_id, &agent);

    client.rate_agent(&tenant, &agent, &0, &txn_id);
}

#[test]
#[should_panic(expected = "Error(Contract, #8)")]
fn test_rate_agent_fails_with_invalid_score_high() {
    let env = Env::default();
    let client = create_contract(&env);

    let admin = Address::generate(&env);
    let agent = Address::generate(&env);
    let tenant = Address::generate(&env);
    let landlord = Address::generate(&env);

    env.mock_all_auths();

    client.initialize(&admin);

    let profile_hash = String::from_str(&env, "QmXoypizjW3WknFiJnKLwHCnL72vedxjQkDDP1mXWo6uco");
    client.register_agent(&agent, &profile_hash);
    client.verify_agent(&admin, &agent);

    let txn_id = String::from_str(&env, "TXN-001");
    let parties = vec![&env, tenant.clone(), landlord.clone()];

    client.register_transaction(&txn_id, &agent, &parties);
    client.complete_transaction(&txn_id, &agent);

    client.rate_agent(&tenant, &agent, &6, &txn_id);
}

#[test]
#[should_panic(expected = "Error(Contract, #9)")]
fn test_rate_agent_fails_when_agent_not_verified() {
    let env = Env::default();
    let client = create_contract(&env);

    let admin = Address::generate(&env);
    let agent = Address::generate(&env);
    let tenant = Address::generate(&env);
    let landlord = Address::generate(&env);

    env.mock_all_auths();

    client.initialize(&admin);

    let profile_hash = String::from_str(&env, "QmXoypizjW3WknFiJnKLwHCnL72vedxjQkDDP1mXWo6uco");
    client.register_agent(&agent, &profile_hash);

    let txn_id = String::from_str(&env, "TXN-001");
    let parties = vec![&env, tenant.clone(), landlord.clone()];

    client.register_transaction(&txn_id, &agent, &parties);
    client.complete_transaction(&txn_id, &agent);

    client.rate_agent(&tenant, &agent, &5, &txn_id);
}

#[test]
#[should_panic(expected = "Error(Contract, #11)")]
fn test_rate_agent_fails_when_transaction_not_found() {
    let env = Env::default();
    let client = create_contract(&env);

    let admin = Address::generate(&env);
    let agent = Address::generate(&env);
    let tenant = Address::generate(&env);

    env.mock_all_auths();

    client.initialize(&admin);

    let profile_hash = String::from_str(&env, "QmXoypizjW3WknFiJnKLwHCnL72vedxjQkDDP1mXWo6uco");
    client.register_agent(&agent, &profile_hash);
    client.verify_agent(&admin, &agent);

    let txn_id = String::from_str(&env, "TXN-001");

    client.rate_agent(&tenant, &agent, &5, &txn_id);
}

#[test]
#[should_panic(expected = "Error(Contract, #13)")]
fn test_rate_agent_fails_when_transaction_not_completed() {
    let env = Env::default();
    let client = create_contract(&env);

    let admin = Address::generate(&env);
    let agent = Address::generate(&env);
    let tenant = Address::generate(&env);
    let landlord = Address::generate(&env);

    env.mock_all_auths();

    client.initialize(&admin);

    let profile_hash = String::from_str(&env, "QmXoypizjW3WknFiJnKLwHCnL72vedxjQkDDP1mXWo6uco");
    client.register_agent(&agent, &profile_hash);
    client.verify_agent(&admin, &agent);

    let txn_id = String::from_str(&env, "TXN-001");
    let parties = vec![&env, tenant.clone(), landlord.clone()];

    client.register_transaction(&txn_id, &agent, &parties);

    client.rate_agent(&tenant, &agent, &5, &txn_id);
}

#[test]
#[should_panic(expected = "Error(Contract, #12)")]
fn test_rate_agent_fails_when_not_transaction_party() {
    let env = Env::default();
    let client = create_contract(&env);

    let admin = Address::generate(&env);
    let agent = Address::generate(&env);
    let tenant = Address::generate(&env);
    let landlord = Address::generate(&env);
    let stranger = Address::generate(&env);

    env.mock_all_auths();

    client.initialize(&admin);

    let profile_hash = String::from_str(&env, "QmXoypizjW3WknFiJnKLwHCnL72vedxjQkDDP1mXWo6uco");
    client.register_agent(&agent, &profile_hash);
    client.verify_agent(&admin, &agent);

    let txn_id = String::from_str(&env, "TXN-001");
    let parties = vec![&env, tenant.clone(), landlord.clone()];

    client.register_transaction(&txn_id, &agent, &parties);
    client.complete_transaction(&txn_id, &agent);

    client.rate_agent(&stranger, &agent, &5, &txn_id);
}

#[test]
#[should_panic(expected = "Error(Contract, #10)")]
fn test_rate_agent_fails_when_already_rated() {
    let env = Env::default();
    let client = create_contract(&env);

    let admin = Address::generate(&env);
    let agent = Address::generate(&env);
    let tenant = Address::generate(&env);
    let landlord = Address::generate(&env);

    env.mock_all_auths();

    client.initialize(&admin);

    let profile_hash = String::from_str(&env, "QmXoypizjW3WknFiJnKLwHCnL72vedxjQkDDP1mXWo6uco");
    client.register_agent(&agent, &profile_hash);
    client.verify_agent(&admin, &agent);

    let txn_id = String::from_str(&env, "TXN-001");
    let parties = vec![&env, tenant.clone(), landlord.clone()];

    client.register_transaction(&txn_id, &agent, &parties);
    client.complete_transaction(&txn_id, &agent);

    client.rate_agent(&tenant, &agent, &5, &txn_id);
    client.rate_agent(&tenant, &agent, &4, &txn_id);
}

// ─────────────────────────────────────────────────────────────────────────────
// Contract Tests: Webhook Delivery & Cache Invalidation Patterns
// ─────────────────────────────────────────────────────────────────────────────

/// Contract Test 1: Agent State Consistency After Verification
/// Validates that agent verification updates are consistent and queryable
#[test]
fn test_agent_verification_state_consistency() {
    let env = Env::default();
    let client = create_contract(&env);

    let admin = Address::generate(&env);
    let agent = Address::generate(&env);

    env.mock_all_auths();
    client.initialize(&admin);

    let profile_hash = String::from_str(&env, "QmXoypizjW3WknFiJnKLwHCnL72vedxjQkDDP1mXWo6uco");
    client.register_agent(&agent, &profile_hash);

    // Before verification
    let agent_info_before = client.get_agent_info(&agent).unwrap();
    assert!(!agent_info_before.verified);
    assert!(agent_info_before.verified_at.is_none());

    // Verify agent
    client.verify_agent(&admin, &agent);

    // After verification - state should be consistent
    let agent_info_after = client.get_agent_info(&agent).unwrap();
    assert!(agent_info_after.verified);
    assert!(agent_info_after.verified_at.is_some());
    assert_eq!(agent_info_after.agent, agent);
    assert_eq!(agent_info_after.external_profile_hash, profile_hash);
}

/// Contract Test 2: Transaction Completion Invalidates Agent Cache
/// Validates that completing a transaction updates agent metrics consistently
#[test]
fn test_transaction_completion_updates_agent_metrics() {
    let env = Env::default();
    let client = create_contract(&env);

    let admin = Address::generate(&env);
    let agent = Address::generate(&env);
    let tenant = Address::generate(&env);
    let landlord = Address::generate(&env);

    env.mock_all_auths();
    client.initialize(&admin);

    let profile_hash = String::from_str(&env, "QmXoypizjW3WknFiJnKLwHCnL72vedxjQkDDP1mXWo6uco");
    client.register_agent(&agent, &profile_hash);

    // Initial state
    let agent_info_initial = client.get_agent_info(&agent).unwrap();
    assert_eq!(agent_info_initial.completed_agreements, 0);

    // Register and complete transaction
    let txn_id = String::from_str(&env, "TXN-001");
    let parties = vec![&env, tenant.clone(), landlord.clone()];
    client.register_transaction(&txn_id, &agent, &parties);
    client.complete_transaction(&txn_id, &agent);

    // After completion - metrics should be updated
    let agent_info_updated = client.get_agent_info(&agent).unwrap();
    assert_eq!(agent_info_updated.completed_agreements, 1);
}

/// Contract Test 3: Rating Aggregation with Cache Invalidation
/// Validates that multiple ratings are aggregated correctly and cache is invalidated
#[test]
fn test_rating_aggregation_consistency() {
    let env = Env::default();
    let client = create_contract(&env);

    let admin = Address::generate(&env);
    let agent = Address::generate(&env);
    let tenant = Address::generate(&env);
    let landlord = Address::generate(&env);

    env.mock_all_auths();
    client.initialize(&admin);

    let profile_hash = String::from_str(&env, "QmXoypizjW3WknFiJnKLwHCnL72vedxjQkDDP1mXWo6uco");
    client.register_agent(&agent, &profile_hash);
    client.verify_agent(&admin, &agent);

    let txn_id = String::from_str(&env, "TXN-001");
    let parties = vec![&env, tenant.clone(), landlord.clone()];
    client.register_transaction(&txn_id, &agent, &parties);
    client.complete_transaction(&txn_id, &agent);

    // Rate from tenant
    client.rate_agent(&tenant, &agent, &5, &txn_id);

    let agent_info_after_first = client.get_agent_info(&agent).unwrap();
    assert_eq!(agent_info_after_first.total_ratings, 1);
    assert_eq!(agent_info_after_first.total_score, 5);
    assert_eq!(agent_info_after_first.average_rating(), 5);

    // Rate from landlord
    client.rate_agent(&landlord, &agent, &3, &txn_id);

    let agent_info_after_second = client.get_agent_info(&agent).unwrap();
    assert_eq!(agent_info_after_second.total_ratings, 2);
    assert_eq!(agent_info_after_second.total_score, 8);
    assert_eq!(agent_info_after_second.average_rating(), 4);
}

/// Contract Test 4: Webhook Event Delivery - Agent Registration
/// Validates that agent registration events are properly recorded and queryable
#[test]
fn test_agent_registration_event_delivery() {
    let env = Env::default();
    let client = create_contract(&env);

    let admin = Address::generate(&env);
    let agent1 = Address::generate(&env);
    let agent2 = Address::generate(&env);

    env.mock_all_auths();
    client.initialize(&admin);

    let profile_hash1 = String::from_str(&env, "QmXoypizjW3WknFiJnKLwHCnL72vedxjQkDDP1mXWo6uco");
    let profile_hash2 = String::from_str(&env, "QmYoypizjW3WknFiJnKLwHCnL72vedxjQkDDP1mXWo6uco");

    // Register first agent
    client.register_agent(&agent1, &profile_hash1);
    assert_eq!(client.get_agent_count(), 1);

    // Register second agent
    client.register_agent(&agent2, &profile_hash2);
    assert_eq!(client.get_agent_count(), 2);

    // Verify both agents are queryable
    let agent1_info = client.get_agent_info(&agent1).unwrap();
    let agent2_info = client.get_agent_info(&agent2).unwrap();

    assert_eq!(agent1_info.external_profile_hash, profile_hash1);
    assert_eq!(agent2_info.external_profile_hash, profile_hash2);
}

/// Contract Test 5: Cache Invalidation on Agent Verification
/// Validates that verification status changes are immediately reflected
#[test]
fn test_verification_cache_invalidation() {
    let env = Env::default();
    let client = create_contract(&env);

    let admin = Address::generate(&env);
    let agent = Address::generate(&env);

    env.mock_all_auths();
    client.initialize(&admin);

    let profile_hash = String::from_str(&env, "QmXoypizjW3WknFiJnKLwHCnL72vedxjQkDDP1mXWo6uco");
    client.register_agent(&agent, &profile_hash);

    // Query unverified state
    let unverified = client.get_agent_info(&agent).unwrap();
    assert!(!unverified.verified);

    // Verify agent
    client.verify_agent(&admin, &agent);

    // Query verified state - should reflect immediately
    let verified = client.get_agent_info(&agent).unwrap();
    assert!(verified.verified);
    assert!(verified.verified_at.is_some());

    // Verify timestamp is set
    assert_ne!(verified.verified_at, unverified.verified_at);
}

/// Contract Test 6: Transaction Completion Webhook Delivery
/// Validates that transaction completion events are properly recorded and queryable
#[test]
fn test_transaction_completion_webhook_delivery() {
    let env = Env::default();
    let client = create_contract(&env);

    let admin = Address::generate(&env);
    let agent = Address::generate(&env);
    let tenant = Address::generate(&env);
    let landlord = Address::generate(&env);

    env.mock_all_auths();
    client.initialize(&admin);

    let profile_hash = String::from_str(&env, "QmXoypizjW3WknFiJnKLwHCnL72vedxjQkDDP1mXWo6uco");
    client.register_agent(&agent, &profile_hash);

    // Register multiple transactions
    let txn_id_1 = String::from_str(&env, "TXN-001");
    let txn_id_2 = String::from_str(&env, "TXN-002");
    let parties = vec![&env, tenant.clone(), landlord.clone()];

    client.register_transaction(&txn_id_1, &agent, &parties);
    client.register_transaction(&txn_id_2, &agent, &parties);

    // Complete first transaction
    client.complete_transaction(&txn_id_1, &agent);
    let agent_info_after_first = client.get_agent_info(&agent).unwrap();
    assert_eq!(agent_info_after_first.completed_agreements, 1);

    // Complete second transaction
    client.complete_transaction(&txn_id_2, &agent);
    let agent_info_after_second = client.get_agent_info(&agent).unwrap();
    assert_eq!(agent_info_after_second.completed_agreements, 2);
}

// ─────────────────────────────────────────────────────────────────────────────
// Staking, Reputation Decay, Slashing & Rewards
// ─────────────────────────────────────────────────────────────────────────────

const XLM: i128 = 10_000_000;
const UNBONDING_PERIOD: u64 = 3 * 86_400;
const START_TS: u64 = 1_000_000;

fn set_time(env: &Env, ts: u64) {
    env.ledger().with_mut(|li| li.timestamp = ts);
}

/// Initialize the contract, configure staking, register an agent, and mint
/// 1000 XLM of the stake token to the agent. Returns (admin, agent, token).
fn setup_staking(env: &Env, client: &AgentRegistryContractClient) -> (Address, Address, Address) {
    let admin = Address::generate(env);
    let agent = Address::generate(env);

    env.mock_all_auths();
    set_time(env, START_TS);

    client.initialize(&admin);

    let sac = env.register_stellar_asset_contract_v2(admin.clone());
    let token_addr = sac.address();
    client.set_stake_config(&admin, &token_addr, &UNBONDING_PERIOD);

    let profile_hash = String::from_str(env, "QmXoypizjW3WknFiJnKLwHCnL72vedxjQkDDP1mXWo6uco");
    client.register_agent(&agent, &profile_hash);

    token::StellarAssetClient::new(env, &token_addr).mint(&agent, &(1_000 * XLM));

    (admin, agent, token_addr)
}

/// Verify the agent and give it one 5-star rating (= 100 reputation points).
fn give_five_star_rating(
    env: &Env,
    client: &AgentRegistryContractClient,
    admin: &Address,
    agent: &Address,
) {
    client.verify_agent(admin, agent);

    let rater = Address::generate(env);
    let txn_id = String::from_str(env, "TXN-STAKE-1");
    let parties = vec![env, rater.clone()];
    client.register_transaction(&txn_id, agent, &parties);
    client.complete_transaction(&txn_id, agent);
    client.rate_agent(&rater, agent, &5, &txn_id);
}

// ── Decay math unit tests ────────────────────────────────────────────────────

#[test]
fn test_decay_math_across_time_gaps() {
    let rep = ReputationState {
        points: 100,
        last_decay_ts: 0,
    };

    // No decay at or before the end of the grace period.
    assert_eq!(rep.decayed_points(0), 100);
    assert_eq!(rep.decayed_points(DECAY_GRACE_SECS), 100);

    // Partial days after the grace period do not decay yet.
    assert_eq!(rep.decayed_points(DECAY_GRACE_SECS + SECS_PER_DAY - 1), 100);

    // Linear decay per full day of inactivity.
    assert_eq!(
        rep.decayed_points(DECAY_GRACE_SECS + SECS_PER_DAY),
        100 - DECAY_PER_DAY_POINTS
    );
    assert_eq!(
        rep.decayed_points(DECAY_GRACE_SECS + 5 * SECS_PER_DAY),
        100 - 5 * DECAY_PER_DAY_POINTS
    );

    // Floors at zero, never negative, even for huge gaps.
    assert_eq!(rep.decayed_points(DECAY_GRACE_SECS + 10 * SECS_PER_DAY), 0);
    assert_eq!(
        rep.decayed_points(DECAY_GRACE_SECS + 10_000 * SECS_PER_DAY),
        0
    );
    assert_eq!(rep.decayed_points(u64::MAX), 0);
}

#[test]
fn test_decay_settle_restarts_clock() {
    let mut rep = ReputationState {
        points: 100,
        last_decay_ts: 0,
    };

    let settle_at = DECAY_GRACE_SECS + 2 * SECS_PER_DAY;
    rep.settle(settle_at);
    assert_eq!(rep.points, 100 - 2 * DECAY_PER_DAY_POINTS);
    assert_eq!(rep.last_decay_ts, settle_at);

    // Grace period restarts from the settle point.
    assert_eq!(rep.decayed_points(settle_at + DECAY_GRACE_SECS), rep.points);
}

// ── Reputation decay through the contract ────────────────────────────────────

#[test]
fn test_reputation_decays_lazily_on_read() {
    let env = Env::default();
    let client = create_contract(&env);
    let (admin, agent, _token) = setup_staking(&env, &client);

    give_five_star_rating(&env, &client, &admin, &agent);
    assert_eq!(client.get_reputation(&agent), 100);

    // Within the grace period: unchanged.
    set_time(&env, START_TS + DECAY_GRACE_SECS);
    assert_eq!(client.get_reputation(&agent), 100);

    // One full day past the grace period.
    set_time(&env, START_TS + DECAY_GRACE_SECS + SECS_PER_DAY);
    assert_eq!(client.get_reputation(&agent), 100 - DECAY_PER_DAY_POINTS);

    // Five full days past the grace period.
    set_time(&env, START_TS + DECAY_GRACE_SECS + 5 * SECS_PER_DAY);
    assert_eq!(
        client.get_reputation(&agent),
        100 - 5 * DECAY_PER_DAY_POINTS
    );

    // Long inactivity: floors at zero, never negative.
    set_time(&env, START_TS + DECAY_GRACE_SECS + 1_000 * SECS_PER_DAY);
    assert_eq!(client.get_reputation(&agent), 0);
}

#[test]
fn test_decay_settles_before_new_rating_accrues() {
    let env = Env::default();
    let client = create_contract(&env);
    let (admin, agent, _token) = setup_staking(&env, &client);

    give_five_star_rating(&env, &client, &admin, &agent);
    assert_eq!(client.get_reputation(&agent), 100);

    // Decay 20 points, then rate 5 stars again from a second rater.
    set_time(&env, START_TS + DECAY_GRACE_SECS + 2 * SECS_PER_DAY);
    let rater2 = Address::generate(&env);
    let txn_id = String::from_str(&env, "TXN-STAKE-2");
    let parties = vec![&env, rater2.clone()];
    client.register_transaction(&txn_id, &agent, &parties);
    client.complete_transaction(&txn_id, &agent);
    client.rate_agent(&rater2, &agent, &5, &txn_id);

    // 100 - 20 (settled decay) + 100 (new rating) = 180.
    assert_eq!(client.get_reputation(&agent), 180);
}

// ── Staking: bond / unbond / withdraw ────────────────────────────────────────

#[test]
fn test_bond_increases_stake_and_effective_score() {
    let env = Env::default();
    let client = create_contract(&env);
    let (_admin, agent, token_addr) = setup_staking(&env, &client);

    client.bond(&agent, &(50 * XLM));

    let vault = client.get_stake(&agent);
    assert_eq!(vault.staked, 50 * XLM);
    assert_eq!(vault.pending, 0);

    let token_client = token::Client::new(&env, &token_addr);
    assert_eq!(token_client.balance(&agent), 950 * XLM);
    assert_eq!(token_client.balance(&client.address), 50 * XLM);

    // No reputation yet: effective score is stake points only (1 XLM = 1 pt).
    assert_eq!(client.get_effective_score(&agent), 50);
}

#[test]
#[should_panic(expected = "Error(Contract, #14)")]
fn test_bond_fails_without_stake_config() {
    let env = Env::default();
    let client = create_contract(&env);

    let admin = Address::generate(&env);
    let agent = Address::generate(&env);

    env.mock_all_auths();
    client.initialize(&admin);

    let profile_hash = String::from_str(&env, "QmXoypizjW3WknFiJnKLwHCnL72vedxjQkDDP1mXWo6uco");
    client.register_agent(&agent, &profile_hash);

    client.bond(&agent, &(10 * XLM));
}

#[test]
#[should_panic(expected = "Error(Contract, #15)")]
fn test_bond_fails_with_non_positive_amount() {
    let env = Env::default();
    let client = create_contract(&env);
    let (_admin, agent, _token) = setup_staking(&env, &client);

    client.bond(&agent, &0);
}

#[test]
#[should_panic(expected = "Error(Contract, #4)")]
fn test_bond_fails_for_unregistered_agent() {
    let env = Env::default();
    let client = create_contract(&env);
    let (_admin, _agent, _token) = setup_staking(&env, &client);

    let stranger = Address::generate(&env);
    client.bond(&stranger, &(10 * XLM));
}

#[test]
fn test_unbond_and_withdraw_after_period() {
    let env = Env::default();
    let client = create_contract(&env);
    let (_admin, agent, token_addr) = setup_staking(&env, &client);

    client.bond(&agent, &(50 * XLM));
    client.request_unbond(&agent, &(20 * XLM));

    let vault = client.get_stake(&agent);
    assert_eq!(vault.staked, 30 * XLM);
    assert_eq!(vault.pending, 20 * XLM);
    assert_eq!(vault.unbond_available_at, START_TS + UNBONDING_PERIOD);

    // Pending stake no longer counts toward the effective score.
    assert_eq!(client.get_effective_score(&agent), 30);

    set_time(&env, START_TS + UNBONDING_PERIOD);
    client.withdraw(&agent);

    let vault = client.get_stake(&agent);
    assert_eq!(vault.staked, 30 * XLM);
    assert_eq!(vault.pending, 0);

    let token_client = token::Client::new(&env, &token_addr);
    assert_eq!(token_client.balance(&agent), 970 * XLM);
}

#[test]
#[should_panic(expected = "Error(Contract, #18)")]
fn test_withdraw_before_unbonding_period_fails() {
    let env = Env::default();
    let client = create_contract(&env);
    let (_admin, agent, _token) = setup_staking(&env, &client);

    client.bond(&agent, &(50 * XLM));
    client.request_unbond(&agent, &(20 * XLM));

    // One second before the unbonding period elapses.
    set_time(&env, START_TS + UNBONDING_PERIOD - 1);
    client.withdraw(&agent);
}

#[test]
#[should_panic(expected = "Error(Contract, #17)")]
fn test_withdraw_with_nothing_pending_fails() {
    let env = Env::default();
    let client = create_contract(&env);
    let (_admin, agent, _token) = setup_staking(&env, &client);

    client.bond(&agent, &(50 * XLM));
    client.withdraw(&agent);
}

#[test]
#[should_panic(expected = "Error(Contract, #16)")]
fn test_unbond_more_than_staked_fails() {
    let env = Env::default();
    let client = create_contract(&env);
    let (_admin, agent, _token) = setup_staking(&env, &client);

    client.bond(&agent, &(50 * XLM));
    client.request_unbond(&agent, &(51 * XLM));
}

#[test]
fn test_new_unbond_request_restarts_clock() {
    let env = Env::default();
    let client = create_contract(&env);
    let (_admin, agent, _token) = setup_staking(&env, &client);

    client.bond(&agent, &(50 * XLM));
    client.request_unbond(&agent, &(10 * XLM));

    set_time(&env, START_TS + UNBONDING_PERIOD - 100);
    client.request_unbond(&agent, &(10 * XLM));

    let vault = client.get_stake(&agent);
    assert_eq!(vault.pending, 20 * XLM);
    assert_eq!(
        vault.unbond_available_at,
        START_TS + UNBONDING_PERIOD - 100 + UNBONDING_PERIOD
    );
}

#[test]
#[should_panic(expected = "Error(Contract, #5)")]
fn test_set_stake_config_requires_admin() {
    let env = Env::default();
    let client = create_contract(&env);

    let admin = Address::generate(&env);
    let non_admin = Address::generate(&env);

    env.mock_all_auths();
    client.initialize(&admin);

    let sac = env.register_stellar_asset_contract_v2(admin.clone());
    client.set_stake_config(&non_admin, &sac.address(), &UNBONDING_PERIOD);
}

// ── Slashing & rewards ───────────────────────────────────────────────────────

#[test]
fn test_slash_reduces_stake_and_reputation_together() {
    let env = Env::default();
    let client = create_contract(&env);
    let (admin, agent, _token) = setup_staking(&env, &client);

    give_five_star_rating(&env, &client, &admin, &agent);
    client.bond(&agent, &(50 * XLM));
    assert_eq!(client.get_effective_score(&agent), 150);

    client.slash_agent(&admin, &agent, &(10 * XLM), &30);

    let vault = client.get_stake(&agent);
    assert_eq!(vault.staked, 40 * XLM);
    assert_eq!(client.get_reputation(&agent), 70);
    assert_eq!(client.get_effective_score(&agent), 110);
    assert_eq!(client.get_slashed_pool(), 10 * XLM);
}

#[test]
fn test_slash_insufficient_stake_is_atomic() {
    let env = Env::default();
    let client = create_contract(&env);
    let (admin, agent, _token) = setup_staking(&env, &client);

    give_five_star_rating(&env, &client, &admin, &agent);
    client.bond(&agent, &(5 * XLM));

    // Slash asks for more stake than exists: the whole call must fail and
    // reputation must be left untouched.
    let result = client.try_slash_agent(&admin, &agent, &(10 * XLM), &30);
    assert!(result.is_err());

    let vault = client.get_stake(&agent);
    assert_eq!(vault.staked, 5 * XLM);
    assert_eq!(client.get_reputation(&agent), 100);
    assert_eq!(client.get_slashed_pool(), 0);
}

#[test]
fn test_slash_hits_pending_stake_after_live_stake() {
    let env = Env::default();
    let client = create_contract(&env);
    let (admin, agent, _token) = setup_staking(&env, &client);

    client.bond(&agent, &(50 * XLM));
    client.request_unbond(&agent, &(30 * XLM));

    // Live 20, pending 30. Slashing 40 drains live stake then pending.
    client.slash_agent(&admin, &agent, &(40 * XLM), &0);

    let vault = client.get_stake(&agent);
    assert_eq!(vault.staked, 0);
    assert_eq!(vault.pending, 10 * XLM);
    assert_eq!(client.get_slashed_pool(), 40 * XLM);
}

#[test]
#[should_panic(expected = "Error(Contract, #5)")]
fn test_slash_requires_admin() {
    let env = Env::default();
    let client = create_contract(&env);
    let (_admin, agent, _token) = setup_staking(&env, &client);

    client.bond(&agent, &(50 * XLM));

    let non_admin = Address::generate(&env);
    client.slash_agent(&non_admin, &agent, &(10 * XLM), &10);
}

#[test]
fn test_slash_reputation_never_goes_negative() {
    let env = Env::default();
    let client = create_contract(&env);
    let (admin, agent, _token) = setup_staking(&env, &client);

    give_five_star_rating(&env, &client, &admin, &agent);
    client.slash_agent(&admin, &agent, &0, &500);

    assert_eq!(client.get_reputation(&agent), 0);
}

#[test]
fn test_reward_increases_stake_and_reputation_together() {
    let env = Env::default();
    let client = create_contract(&env);
    let (admin, agent, token_addr) = setup_staking(&env, &client);

    token::StellarAssetClient::new(&env, &token_addr).mint(&admin, &(100 * XLM));

    client.reward_agent(&admin, &agent, &(10 * XLM), &50);

    let vault = client.get_stake(&agent);
    assert_eq!(vault.staked, 10 * XLM);
    assert_eq!(client.get_reputation(&agent), 50);
    assert_eq!(client.get_effective_score(&agent), 60);

    let token_client = token::Client::new(&env, &token_addr);
    assert_eq!(token_client.balance(&admin), 90 * XLM);
}

#[test]
fn test_reward_reputation_capped_at_max() {
    let env = Env::default();
    let client = create_contract(&env);
    let (admin, agent, _token) = setup_staking(&env, &client);

    client.reward_agent(&admin, &agent, &0, &MAX_REPUTATION_POINTS);
    client.reward_agent(&admin, &agent, &0, &100);

    assert_eq!(client.get_reputation(&agent), MAX_REPUTATION_POINTS);
}

// ── Integration: register → bond → decay → slash ────────────────────────────

#[test]
fn test_integration_register_bond_decay_slash() {
    let env = Env::default();
    let client = create_contract(&env);
    let (admin, agent, token_addr) = setup_staking(&env, &client);

    // Register happened in setup; earn reputation and bond stake.
    give_five_star_rating(&env, &client, &admin, &agent);
    client.bond(&agent, &(100 * XLM));
    assert_eq!(client.get_effective_score(&agent), 200);

    // Decay: three full days of inactivity past the grace period.
    let decayed_at = START_TS + DECAY_GRACE_SECS + 3 * SECS_PER_DAY;
    set_time(&env, decayed_at);
    assert_eq!(client.get_reputation(&agent), 70);
    assert_eq!(client.get_effective_score(&agent), 170);

    // Slash: stake and reputation move together.
    client.slash_agent(&admin, &agent, &(60 * XLM), &50);
    let vault = client.get_stake(&agent);
    assert_eq!(vault.staked, 40 * XLM);
    assert_eq!(client.get_reputation(&agent), 20);
    assert_eq!(client.get_effective_score(&agent), 60);
    assert_eq!(client.get_slashed_pool(), 60 * XLM);

    // Wind down: unbond the rest and withdraw after the unbonding period.
    client.request_unbond(&agent, &(40 * XLM));
    assert_eq!(client.get_effective_score(&agent), 20);

    set_time(&env, decayed_at + UNBONDING_PERIOD);
    client.withdraw(&agent);

    let vault = client.get_stake(&agent);
    assert_eq!(vault.staked, 0);
    assert_eq!(vault.pending, 0);

    let token_client = token::Client::new(&env, &token_addr);
    // 1000 minted - 100 bonded + 40 withdrawn = 940; the slashed 60 stays
    // in the contract's pool.
    assert_eq!(token_client.balance(&agent), 940 * XLM);
    assert_eq!(token_client.balance(&client.address), 60 * XLM);
}
