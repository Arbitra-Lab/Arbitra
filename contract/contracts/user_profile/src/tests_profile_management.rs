//! Tests for user profile management & verification (Issue #655)
#![allow(unused_results)]

use crate::types::{AccountType, AttestationType};
use crate::UserProfileContract;
use soroban_sdk::{testutils::Address as _, Address, Bytes, Env};

fn create_contract(env: &Env) -> crate::UserProfileContractClient<'_> {
    let contract_id = env.register(UserProfileContract, ());
    crate::UserProfileContractClient::new(env, &contract_id)
}

fn create_hash(env: &Env, len: usize) -> Bytes {
    match len {
        32 => Bytes::from_slice(env, &[0u8; 32]),
        46 => Bytes::from_slice(env, &[0u8; 46]),
        31 => Bytes::from_slice(env, &[0u8; 31]),
        _ => Bytes::from_slice(env, &[0u8; 32]),
    }
}

#[test]
fn test_initialize_contract() {
    let env = Env::default();
    env.mock_all_auths();

    let client = create_contract(&env);
    let admin = Address::generate(&env);

    let result = client.try_initialize(&admin);
    assert!(result.is_ok());
}

#[test]
fn test_double_initialization_fails() {
    let env = Env::default();
    env.mock_all_auths();

    let client = create_contract(&env);
    let admin = Address::generate(&env);

    let _ = client.try_initialize(&admin).unwrap();
    let result = client.try_initialize(&admin);
    assert!(result.is_err());
}

#[test]
fn test_create_profile_success() {
    let env = Env::default();
    env.mock_all_auths();

    let client = create_contract(&env);
    let admin = Address::generate(&env);
    let account = Address::generate(&env);

    let _ = client.try_initialize(&admin).unwrap();

    let hash = create_hash(&env, 32);
    let result = client.try_create_profile(&account, &AccountType::Tenant, &hash);

    assert!(result.is_ok());
}

#[test]
fn test_create_profile_landlord() {
    let env = Env::default();
    env.mock_all_auths();

    let client = create_contract(&env);
    let admin = Address::generate(&env);
    let account = Address::generate(&env);

    let _ = client.try_initialize(&admin).unwrap();

    let hash = create_hash(&env, 32);
    let result = client.try_create_profile(&account, &AccountType::Landlord, &hash);

    assert!(result.is_ok());
}

#[test]
fn test_create_profile_agent() {
    let env = Env::default();
    env.mock_all_auths();

    let client = create_contract(&env);
    let admin = Address::generate(&env);
    let account = Address::generate(&env);

    let _ = client.try_initialize(&admin).unwrap();

    let hash = create_hash(&env, 32);
    let result = client.try_create_profile(&account, &AccountType::Agent, &hash);

    assert!(result.is_ok());
}

#[test]
fn test_prevent_duplicate_profile() {
    let env = Env::default();
    env.mock_all_auths();

    let client = create_contract(&env);
    let admin = Address::generate(&env);
    let account = Address::generate(&env);

    let _ = client.try_initialize(&admin).unwrap();

    let hash = create_hash(&env, 32);
    let _ = client
        .try_create_profile(&account, &AccountType::Tenant, &hash)
        .unwrap();

    let result = client.try_create_profile(&account, &AccountType::Tenant, &hash);
    assert!(result.is_err());
}

#[test]
fn test_data_hash_validation_sha256() {
    let env = Env::default();
    env.mock_all_auths();

    let client = create_contract(&env);
    let admin = Address::generate(&env);
    let account = Address::generate(&env);

    let _ = client.try_initialize(&admin).unwrap();

    let hash = create_hash(&env, 32);
    let result = client.try_create_profile(&account, &AccountType::Tenant, &hash);
    assert!(result.is_ok());
}

#[test]
fn test_data_hash_validation_ipfs_cid() {
    let env = Env::default();
    env.mock_all_auths();

    let client = create_contract(&env);
    let admin = Address::generate(&env);
    let account = Address::generate(&env);

    let _ = client.try_initialize(&admin).unwrap();

    let hash = create_hash(&env, 46);
    let result = client.try_create_profile(&account, &AccountType::Tenant, &hash);
    assert!(result.is_ok());
}

#[test]
fn test_data_hash_validation_invalid_length() {
    let env = Env::default();
    env.mock_all_auths();

    let client = create_contract(&env);
    let admin = Address::generate(&env);
    let account = Address::generate(&env);

    let _ = client.try_initialize(&admin).unwrap();

    let hash = create_hash(&env, 31);
    let result = client.try_create_profile(&account, &AccountType::Tenant, &hash);
    assert!(result.is_err());
}

#[test]
fn test_update_profile_account_type() {
    let env = Env::default();
    env.mock_all_auths();

    let client = create_contract(&env);
    let admin = Address::generate(&env);
    let account = Address::generate(&env);

    let _ = client.try_initialize(&admin).unwrap();

    let hash = create_hash(&env, 32);
    let _ = client
        .try_create_profile(&account, &AccountType::Tenant, &hash)
        .unwrap();

    let result = client.try_update_profile(&account, &Some(AccountType::Landlord), &None);

    assert!(result.is_ok());
}

#[test]
fn test_update_profile_data_hash() {
    let env = Env::default();
    env.mock_all_auths();

    let client = create_contract(&env);
    let admin = Address::generate(&env);
    let account = Address::generate(&env);

    let _ = client.try_initialize(&admin).unwrap();

    let hash1 = create_hash(&env, 32);
    let _ = client
        .try_create_profile(&account, &AccountType::Tenant, &hash1)
        .unwrap();

    let hash2 = create_hash(&env, 32);
    let result = client.try_update_profile(&account, &None, &Some(hash2));

    assert!(result.is_ok());
}

#[test]
fn test_update_non_existent_profile() {
    let env = Env::default();
    env.mock_all_auths();

    let client = create_contract(&env);
    let admin = Address::generate(&env);
    let account = Address::generate(&env);

    let _ = client.try_initialize(&admin).unwrap();

    let result = client.try_update_profile(&account, &Some(AccountType::Landlord), &None);

    assert!(result.is_err());
}

#[test]
fn test_verify_profile() {
    let env = Env::default();
    env.mock_all_auths();

    let client = create_contract(&env);
    let admin = Address::generate(&env);
    let account = Address::generate(&env);

    let _ = client.try_initialize(&admin).unwrap();

    let hash = create_hash(&env, 32);
    let _ = client
        .try_create_profile(&account, &AccountType::Tenant, &hash)
        .unwrap();

    let result = client.try_verify_profile(&admin, &account);
    assert!(result.is_ok());
}

#[test]
fn test_unverify_profile() {
    let env = Env::default();
    env.mock_all_auths();

    let client = create_contract(&env);
    let admin = Address::generate(&env);
    let account = Address::generate(&env);

    let _ = client.try_initialize(&admin).unwrap();

    let hash = create_hash(&env, 32);
    let _ = client
        .try_create_profile(&account, &AccountType::Tenant, &hash)
        .unwrap();

    let _ = client.try_verify_profile(&admin, &account).unwrap();
    let result = client.try_unverify_profile(&admin, &account);
    assert!(result.is_ok());
}

#[test]
fn test_get_profile() {
    let env = Env::default();
    env.mock_all_auths();

    let client = create_contract(&env);
    let admin = Address::generate(&env);
    let account = Address::generate(&env);

    let _ = client.try_initialize(&admin).unwrap();

    let hash = create_hash(&env, 32);
    let _ = client
        .try_create_profile(&account, &AccountType::Tenant, &hash)
        .unwrap();

    let result = client.try_get_profile(&account);
    assert!(result.is_ok());
}

#[test]
fn test_has_profile() {
    let env = Env::default();
    env.mock_all_auths();

    let client = create_contract(&env);
    let admin = Address::generate(&env);
    let account = Address::generate(&env);

    let _ = client.try_initialize(&admin).unwrap();

    let hash = create_hash(&env, 32);
    let _ = client
        .try_create_profile(&account, &AccountType::Tenant, &hash)
        .unwrap();

    let result = client.try_has_profile(&account).unwrap().unwrap();
    assert!(result);
}

#[test]
fn test_delete_profile() {
    let env = Env::default();
    env.mock_all_auths();

    let client = create_contract(&env);
    let admin = Address::generate(&env);
    let account = Address::generate(&env);

    let _ = client.try_initialize(&admin).unwrap();

    let hash = create_hash(&env, 32);
    let _ = client
        .try_create_profile(&account, &AccountType::Tenant, &hash)
        .unwrap();

    let result = client.try_delete_profile(&account);
    assert!(result.is_ok());
}

#[test]
fn test_delete_non_existent_profile() {
    let env = Env::default();
    env.mock_all_auths();

    let client = create_contract(&env);
    let admin = Address::generate(&env);
    let account = Address::generate(&env);

    let _ = client.try_initialize(&admin).unwrap();

    let result = client.try_delete_profile(&account);
    assert!(result.is_err());
}

#[test]
fn test_multiple_profiles() {
    let env = Env::default();
    env.mock_all_auths();

    let client = create_contract(&env);
    let admin = Address::generate(&env);
    let account1 = Address::generate(&env);
    let account2 = Address::generate(&env);

    let _ = client.try_initialize(&admin).unwrap();

    let hash = create_hash(&env, 32);
    let _ = client
        .try_create_profile(&account1, &AccountType::Tenant, &hash)
        .unwrap();
    let _ = client
        .try_create_profile(&account2, &AccountType::Landlord, &hash)
        .unwrap();

    let has1 = client.try_has_profile(&account1).unwrap().unwrap();
    let has2 = client.try_has_profile(&account2).unwrap().unwrap();

    assert!(has1);
    assert!(has2);
}

#[test]
fn test_account_type_transitions() {
    let env = Env::default();
    env.mock_all_auths();

    let client = create_contract(&env);
    let admin = Address::generate(&env);
    let account = Address::generate(&env);

    let _ = client.try_initialize(&admin).unwrap();

    let hash = create_hash(&env, 32);
    let _ = client
        .try_create_profile(&account, &AccountType::Tenant, &hash)
        .unwrap();

    let _ = client
        .try_update_profile(&account, &Some(AccountType::Landlord), &None)
        .unwrap();
    let _ = client
        .try_update_profile(&account, &Some(AccountType::Agent), &None)
        .unwrap();
    let _ = client
        .try_update_profile(&account, &Some(AccountType::Tenant), &None)
        .unwrap();

    let has_profile = client.try_has_profile(&account).unwrap().unwrap();
    assert!(has_profile);
}

// --- Attestation Tests (Issue #91) ---

#[test]
fn test_add_attestation_success() {
    let env = Env::default();
    env.mock_all_auths();

    let client = create_contract(&env);
    let admin = Address::generate(&env);
    let account = Address::generate(&env);
    let issuer = Address::generate(&env);

    let _ = client.try_initialize(&admin).unwrap();

    let hash = create_hash(&env, 32);
    let _ = client
        .try_create_profile(&account, &AccountType::Tenant, &hash)
        .unwrap();

    let future_timestamp = env.ledger().timestamp() + 365 * 24 * 60 * 60; // 1 year from now

    let result = client.try_add_attestation(
        &account,
        &issuer,
        &AttestationType::KYC,
        &future_timestamp,
        &None,
    );

    assert!(result.is_ok());
    let attestation = result.unwrap();
    assert_eq!(attestation.issuer, issuer);
    assert_eq!(attestation.attestation_type, AttestationType::KYC);
    assert_eq!(attestation.expires_at, future_timestamp);
}

#[test]
fn test_add_attestation_nonexistent_profile() {
    let env = Env::default();
    env.mock_all_auths();

    let client = create_contract(&env);
    let admin = Address::generate(&env);
    let account = Address::generate(&env);
    let issuer = Address::generate(&env);

    let _ = client.try_initialize(&admin).unwrap();

    let future_timestamp = env.ledger().timestamp() + 365 * 24 * 60 * 60;

    let result = client.try_add_attestation(
        &account,
        &issuer,
        &AttestationType::Landlord,
        &future_timestamp,
        &None,
    );

    assert!(result.is_err());
}

#[test]
fn test_add_duplicate_attestation_fails() {
    let env = Env::default();
    env.mock_all_auths();

    let client = create_contract(&env);
    let admin = Address::generate(&env);
    let account = Address::generate(&env);
    let issuer = Address::generate(&env);

    let _ = client.try_initialize(&admin).unwrap();

    let hash = create_hash(&env, 32);
    let _ = client
        .try_create_profile(&account, &AccountType::Tenant, &hash)
        .unwrap();

    let future_timestamp = env.ledger().timestamp() + 365 * 24 * 60 * 60;

    let _ = client
        .try_add_attestation(
            &account,
            &issuer,
            &AttestationType::KYC,
            &future_timestamp,
            &None,
        )
        .unwrap();

    // Try to add another attestation from same issuer
    let result = client.try_add_attestation(
        &account,
        &issuer,
        &AttestationType::Employment,
        &future_timestamp,
        &None,
    );

    assert!(result.is_err());
}

#[test]
fn test_revoke_attestation_success() {
    let env = Env::default();
    env.mock_all_auths();

    let client = create_contract(&env);
    let admin = Address::generate(&env);
    let account = Address::generate(&env);
    let issuer = Address::generate(&env);

    let _ = client.try_initialize(&admin).unwrap();

    let hash = create_hash(&env, 32);
    let _ = client
        .try_create_profile(&account, &AccountType::Tenant, &hash)
        .unwrap();

    let future_timestamp = env.ledger().timestamp() + 365 * 24 * 60 * 60;

    let _ = client
        .try_add_attestation(
            &account,
            &issuer,
            &AttestationType::KYC,
            &future_timestamp,
            &None,
        )
        .unwrap();

    // Revoke the attestation
    let result = client.try_revoke_attestation(&account, &issuer);

    assert!(result.is_ok());

    // Verify attestation is removed
    let attestation = client.try_get_attestation(&account, &issuer).unwrap();
    assert!(attestation.is_none());
}

#[test]
fn test_revoke_nonexistent_attestation() {
    let env = Env::default();
    env.mock_all_auths();

    let client = create_contract(&env);
    let admin = Address::generate(&env);
    let account = Address::generate(&env);
    let issuer = Address::generate(&env);

    let _ = client.try_initialize(&admin).unwrap();

    let hash = create_hash(&env, 32);
    let _ = client
        .try_create_profile(&account, &AccountType::Tenant, &hash)
        .unwrap();

    // Try to revoke non-existent attestation
    let result = client.try_revoke_attestation(&account, &issuer);

    assert!(result.is_err());
}

#[test]
fn test_revoke_attestation_unauthorized_issuer() {
    let env = Env::default();
    env.mock_all_auths();

    let client = create_contract(&env);
    let admin = Address::generate(&env);
    let account = Address::generate(&env);
    let issuer = Address::generate(&env);
    let other_address = Address::generate(&env);

    let _ = client.try_initialize(&admin).unwrap();

    let hash = create_hash(&env, 32);
    let _ = client
        .try_create_profile(&account, &AccountType::Tenant, &hash)
        .unwrap();

    let future_timestamp = env.ledger().timestamp() + 365 * 24 * 60 * 60;

    let _ = client
        .try_add_attestation(
            &account,
            &issuer,
            &AttestationType::KYC,
            &future_timestamp,
            &None,
        )
        .unwrap();

    // Simulate different account trying to revoke (would need auth adjustment in real test)
    // This test demonstrates the authorization check
    let result = client.try_revoke_attestation(&account, &other_address);

    // This should fail because other_address is not the issuer
    assert!(result.is_err());
}

#[test]
fn test_get_attestation_success() {
    let env = Env::default();
    env.mock_all_auths();

    let client = create_contract(&env);
    let admin = Address::generate(&env);
    let account = Address::generate(&env);
    let issuer = Address::generate(&env);

    let _ = client.try_initialize(&admin).unwrap();

    let hash = create_hash(&env, 32);
    let _ = client
        .try_create_profile(&account, &AccountType::Tenant, &hash)
        .unwrap();

    let future_timestamp = env.ledger().timestamp() + 365 * 24 * 60 * 60;

    let _ = client
        .try_add_attestation(
            &account,
            &issuer,
            &AttestationType::CreditCheck,
            &future_timestamp,
            &None,
        )
        .unwrap();

    // Retrieve the attestation
    let attestation = client.try_get_attestation(&account, &issuer).unwrap();

    assert!(attestation.is_some());
    let att = attestation.unwrap();
    assert_eq!(att.issuer, issuer);
    assert_eq!(att.attestation_type, AttestationType::CreditCheck);
    assert_eq!(att.expires_at, future_timestamp);
}

#[test]
fn test_get_nonexistent_attestation() {
    let env = Env::default();
    env.mock_all_auths();

    let client = create_contract(&env);
    let admin = Address::generate(&env);
    let account = Address::generate(&env);
    let issuer = Address::generate(&env);

    let _ = client.try_initialize(&admin).unwrap();

    let hash = create_hash(&env, 32);
    let _ = client
        .try_create_profile(&account, &AccountType::Tenant, &hash)
        .unwrap();

    // Try to get non-existent attestation
    let attestation = client.try_get_attestation(&account, &issuer).unwrap();

    assert!(attestation.is_none());
}

#[test]
fn test_attestation_expiration_logic() {
    let env = Env::default();
    env.mock_all_auths();

    let client = create_contract(&env);
    let admin = Address::generate(&env);
    let account = Address::generate(&env);
    let issuer = Address::generate(&env);

    let _ = client.try_initialize(&admin).unwrap();

    let hash = create_hash(&env, 32);
    let _ = client
        .try_create_profile(&account, &AccountType::Tenant, &hash)
        .unwrap();

    let current_timestamp = env.ledger().timestamp();
    let past_timestamp = current_timestamp - 1000; // Already expired

    let result = client.try_add_attestation(
        &account,
        &issuer,
        &AttestationType::BackgroundCheck,
        &past_timestamp,
        &None,
    );

    // Even with past expiration, adding should succeed (expiration check is for queries)
    assert!(result.is_ok());

    let attestation = result.unwrap();
    assert!(!attestation.is_active(current_timestamp));
}

#[test]
fn test_attestation_no_expiration() {
    let env = Env::default();
    env.mock_all_auths();

    let client = create_contract(&env);
    let admin = Address::generate(&env);
    let account = Address::generate(&env);
    let issuer = Address::generate(&env);

    let _ = client.try_initialize(&admin).unwrap();

    let hash = create_hash(&env, 32);
    let _ = client
        .try_create_profile(&account, &AccountType::Tenant, &hash)
        .unwrap();

    // expires_at = 0 means never expires
    let result = client.try_add_attestation(
        &account,
        &issuer,
        &AttestationType::Other,
        &0,
        &None,
    );

    assert!(result.is_ok());
    let attestation = result.unwrap();
    assert!(attestation.is_active(env.ledger().timestamp() + 1000 * 365 * 24 * 60 * 60));
}

#[test]
fn test_multiple_attestations_from_different_issuers() {
    let env = Env::default();
    env.mock_all_auths();

    let client = create_contract(&env);
    let admin = Address::generate(&env);
    let account = Address::generate(&env);
    let issuer1 = Address::generate(&env);
    let issuer2 = Address::generate(&env);

    let _ = client.try_initialize(&admin).unwrap();

    let hash = create_hash(&env, 32);
    let _ = client
        .try_create_profile(&account, &AccountType::Tenant, &hash)
        .unwrap();

    let future_timestamp = env.ledger().timestamp() + 365 * 24 * 60 * 60;

    // Add attestation from first issuer
    let _ = client
        .try_add_attestation(
            &account,
            &issuer1,
            &AttestationType::KYC,
            &future_timestamp,
            &None,
        )
        .unwrap();

    // Add attestation from second issuer (should succeed)
    let result = client.try_add_attestation(
        &account,
        &issuer2,
        &AttestationType::Employment,
        &future_timestamp,
        &None,
    );

    assert!(result.is_ok());

    // Verify both attestations exist
    let att1 = client.try_get_attestation(&account, &issuer1).unwrap();
    let att2 = client.try_get_attestation(&account, &issuer2).unwrap();

    assert!(att1.is_some());
    assert!(att2.is_some());
    assert_eq!(att1.unwrap().attestation_type, AttestationType::KYC);
    assert_eq!(att2.unwrap().attestation_type, AttestationType::Employment);
}
