//! Tests for multi-sig governance and timelock execution (Issue #654)
#![allow(unused_results)]

use crate::{
    types::{ActionType, Config},
    Contract, ContractClient,
};
use soroban_sdk::{testutils::Address as _, Address, Bytes, Env, Vec};

fn create_contract() -> (Env, ContractClient<'static>, Address) {
    let env = Env::default();
    env.mock_all_auths();

    let contract_id = env.register(Contract, ());
    let client = ContractClient::new(&env, &contract_id);

    let admin = Address::generate(&env);
    let fee_collector = Address::generate(&env);

    let config = Config {
        fee_bps: 100,
        fee_collector,
        paused: false,
    };

    client.initialize(&admin, &config);

    (env, client, admin)
}

// ─── Multi-Sig Initialization Tests ────────────────────────────────────────

#[test]
fn test_initialize_multisig_with_multiple_admins() {
    let (env, client, _admin) = create_contract();

    let admin1 = Address::generate(&env);
    let admin2 = Address::generate(&env);
    let admin3 = Address::generate(&env);

    let mut admins = Vec::new(&env);
    admins.push_back(admin1.clone());
    admins.push_back(admin2.clone());
    admins.push_back(admin3.clone());

    let result = client.try_initialize_multisig(&admins, &2);
    assert!(result.is_ok());
}

#[test]
fn test_get_multisig_config() {
    let (env, client, _admin) = create_contract();

    let admin1 = Address::generate(&env);
    let admin2 = Address::generate(&env);

    let mut admins = Vec::new(&env);
    admins.push_back(admin1.clone());
    admins.push_back(admin2.clone());

    let _ = client.try_initialize_multisig(&admins, &2).unwrap();

    let config = client.try_get_multisig_config().unwrap().unwrap();
    assert_eq!(config.total_admins, 2);
    assert_eq!(config.required_signatures, 2);
}

#[test]
fn test_is_admin_check() {
    let (env, client, _admin) = create_contract();

    let admin1 = Address::generate(&env);
    let admin2 = Address::generate(&env);
    let non_admin = Address::generate(&env);

    let mut admins = Vec::new(&env);
    admins.push_back(admin1.clone());
    admins.push_back(admin2.clone());

    let _ = client.try_initialize_multisig(&admins, &2).unwrap();

    let is_admin1 = client.try_is_admin(&admin1).unwrap().unwrap();
    assert!(is_admin1);

    let is_non_admin = client.try_is_admin(&non_admin).unwrap().unwrap();
    assert!(!is_non_admin);
}

// ─── Proposal Management Tests ─────────────────────────────────────────────

#[test]
fn test_propose_add_admin() {
    let (env, client, _admin) = create_contract();

    let admin1 = Address::generate(&env);
    let admin2 = Address::generate(&env);
    let new_admin = Address::generate(&env);

    let mut admins = Vec::new(&env);
    admins.push_back(admin1.clone());
    admins.push_back(admin2.clone());

    let _ = client.try_initialize_multisig(&admins, &2).unwrap();

    let data = Bytes::new(&env);
    let result = client.try_propose_action(
        &admin1,
        &ActionType::AddAdmin,
        &Some(new_admin.clone()),
        &data,
    );

    assert!(result.is_ok());
}

#[test]
fn test_propose_remove_admin() {
    let (env, client, _admin) = create_contract();

    let admin1 = Address::generate(&env);
    let admin2 = Address::generate(&env);

    let mut admins = Vec::new(&env);
    admins.push_back(admin1.clone());
    admins.push_back(admin2.clone());

    let _ = client.try_initialize_multisig(&admins, &2).unwrap();

    let data = Bytes::new(&env);
    let result = client.try_propose_action(
        &admin1,
        &ActionType::RemoveAdmin,
        &Some(admin2.clone()),
        &data,
    );

    assert!(result.is_ok());
}

#[test]
fn test_get_active_proposals() {
    let (env, client, _admin) = create_contract();

    let admin1 = Address::generate(&env);
    let admin2 = Address::generate(&env);
    let new_admin = Address::generate(&env);

    let mut admins = Vec::new(&env);
    admins.push_back(admin1.clone());
    admins.push_back(admin2.clone());

    let _ = client.try_initialize_multisig(&admins, &2).unwrap();

    let data = Bytes::new(&env);
    let _ = client
        .try_propose_action(
            &admin1,
            &ActionType::AddAdmin,
            &Some(new_admin.clone()),
            &data,
        )
        .unwrap();

    let proposals = client.try_get_active_proposals().unwrap().unwrap();
    assert!(!proposals.is_empty());
}

// ─── Proposal Voting Tests ────────────────────────────────────────────────

#[test]
fn test_approve_action() {
    let (env, client, _admin) = create_contract();

    let admin1 = Address::generate(&env);
    let admin2 = Address::generate(&env);
    let new_admin = Address::generate(&env);

    let mut admins = Vec::new(&env);
    admins.push_back(admin1.clone());
    admins.push_back(admin2.clone());

    let _ = client.try_initialize_multisig(&admins, &2).unwrap();

    let data = Bytes::new(&env);
    let proposal_id = client
        .try_propose_action(
            &admin1,
            &ActionType::AddAdmin,
            &Some(new_admin.clone()),
            &data,
        )
        .unwrap()
        .unwrap();

    let result = client.try_approve_action(&admin2, &proposal_id);
    assert!(result.is_ok());
}

#[test]
fn test_prevent_duplicate_approval() {
    let (env, client, _admin) = create_contract();

    let admin1 = Address::generate(&env);
    let admin2 = Address::generate(&env);
    let new_admin = Address::generate(&env);

    let mut admins = Vec::new(&env);
    admins.push_back(admin1.clone());
    admins.push_back(admin2.clone());

    let _ = client.try_initialize_multisig(&admins, &2).unwrap();

    let data = Bytes::new(&env);
    let proposal_id = client
        .try_propose_action(
            &admin1,
            &ActionType::AddAdmin,
            &Some(new_admin.clone()),
            &data,
        )
        .unwrap()
        .unwrap();

    let _ = client.try_approve_action(&admin2, &proposal_id).unwrap();

    let result = client.try_approve_action(&admin2, &proposal_id);
    assert!(result.is_err());
}

#[test]
fn test_reject_action() {
    let (env, client, _admin) = create_contract();

    let admin1 = Address::generate(&env);
    let admin2 = Address::generate(&env);
    let new_admin = Address::generate(&env);

    let mut admins = Vec::new(&env);
    admins.push_back(admin1.clone());
    admins.push_back(admin2.clone());

    let _ = client.try_initialize_multisig(&admins, &2).unwrap();

    let data = Bytes::new(&env);
    let proposal_id = client
        .try_propose_action(
            &admin1,
            &ActionType::AddAdmin,
            &Some(new_admin.clone()),
            &data,
        )
        .unwrap()
        .unwrap();

    let result = client.try_reject_action(&admin1, &proposal_id);
    assert!(result.is_ok());
}

// ─── Proposal Execution Tests ─────────────────────────────────────────────

#[test]
fn test_execute_approved_proposal() {
    let (env, client, _admin) = create_contract();

    let admin1 = Address::generate(&env);
    let admin2 = Address::generate(&env);
    let new_admin = Address::generate(&env);

    let mut admins = Vec::new(&env);
    admins.push_back(admin1.clone());
    admins.push_back(admin2.clone());

    let _ = client.try_initialize_multisig(&admins, &2).unwrap();

    let data = Bytes::new(&env);
    let proposal_id = client
        .try_propose_action(
            &admin1,
            &ActionType::AddAdmin,
            &Some(new_admin.clone()),
            &data,
        )
        .unwrap()
        .unwrap();

    let _ = client.try_approve_action(&admin2, &proposal_id).unwrap();

    let result = client.try_execute_action(&admin1, &proposal_id);
    assert!(result.is_ok());
}

#[test]
fn test_execute_add_admin_proposal() {
    let (env, client, _admin) = create_contract();

    let admin1 = Address::generate(&env);
    let admin2 = Address::generate(&env);
    let new_admin = Address::generate(&env);

    let mut admins = Vec::new(&env);
    admins.push_back(admin1.clone());
    admins.push_back(admin2.clone());

    let _ = client.try_initialize_multisig(&admins, &2).unwrap();

    let data = Bytes::new(&env);
    let proposal_id = client
        .try_propose_action(
            &admin1,
            &ActionType::AddAdmin,
            &Some(new_admin.clone()),
            &data,
        )
        .unwrap()
        .unwrap();

    let _ = client.try_approve_action(&admin2, &proposal_id).unwrap();
    let result = client.try_execute_action(&admin1, &proposal_id);
    assert!(result.is_ok());
}

#[test]
fn test_prevent_execution_without_approvals() {
    let (env, client, _admin) = create_contract();

    let admin1 = Address::generate(&env);
    let admin2 = Address::generate(&env);
    let new_admin = Address::generate(&env);

    let mut admins = Vec::new(&env);
    admins.push_back(admin1.clone());
    admins.push_back(admin2.clone());

    let _ = client.try_initialize_multisig(&admins, &2).unwrap();

    let data = Bytes::new(&env);
    let proposal_id = client
        .try_propose_action(
            &admin1,
            &ActionType::AddAdmin,
            &Some(new_admin.clone()),
            &data,
        )
        .unwrap()
        .unwrap();

    let result = client.try_execute_action(&admin1, &proposal_id);
    assert!(result.is_err());
}

#[test]
fn test_prevent_double_execution() {
    let (env, client, _admin) = create_contract();

    let admin1 = Address::generate(&env);
    let admin2 = Address::generate(&env);
    let new_admin = Address::generate(&env);

    let mut admins = Vec::new(&env);
    admins.push_back(admin1.clone());
    admins.push_back(admin2.clone());

    let _ = client.try_initialize_multisig(&admins, &2).unwrap();

    let data = Bytes::new(&env);
    let proposal_id = client
        .try_propose_action(
            &admin1,
            &ActionType::AddAdmin,
            &Some(new_admin.clone()),
            &data,
        )
        .unwrap()
        .unwrap();

    let _ = client.try_approve_action(&admin2, &proposal_id).unwrap();
    let _ = client.try_execute_action(&admin1, &proposal_id).unwrap();

    let result = client.try_execute_action(&admin1, &proposal_id);
    assert!(result.is_err());
}

// ─── Edge Cases ────────────────────────────────────────────────────────────

#[test]
fn test_single_admin_multisig() {
    let (env, client, _admin) = create_contract();

    let admin1 = Address::generate(&env);

    let mut admins = Vec::new(&env);
    admins.push_back(admin1.clone());

    let result = client.try_initialize_multisig(&admins, &1);
    assert!(result.is_ok());
}

#[test]
fn test_all_admins_approve() {
    let (env, client, _admin) = create_contract();

    let admin1 = Address::generate(&env);
    let admin2 = Address::generate(&env);
    let admin3 = Address::generate(&env);
    let new_admin = Address::generate(&env);

    let mut admins = Vec::new(&env);
    admins.push_back(admin1.clone());
    admins.push_back(admin2.clone());
    admins.push_back(admin3.clone());

    let _ = client.try_initialize_multisig(&admins, &2).unwrap();

    let data = Bytes::new(&env);
    let proposal_id = client
        .try_propose_action(
            &admin1,
            &ActionType::AddAdmin,
            &Some(new_admin.clone()),
            &data,
        )
        .unwrap()
        .unwrap();

    let _ = client.try_approve_action(&admin2, &proposal_id).unwrap();
    let _ = client.try_approve_action(&admin3, &proposal_id).unwrap();

    let result = client.try_execute_action(&admin1, &proposal_id);
    assert!(result.is_ok());
}
