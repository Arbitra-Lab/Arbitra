use super::*;
use soroban_sdk::{
    testutils::{Address as _, Ledger},
    Address, Env, String,
};

fn create_contract(env: &Env) -> PropertyRegistryContractClient<'_> {
    let contract_id = env.register(PropertyRegistryContract, ());
    PropertyRegistryContractClient::new(env, &contract_id)
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
fn test_register_property_success() {
    let env = Env::default();
    let client = create_contract(&env);

    let admin = Address::generate(&env);
    let landlord = Address::generate(&env);

    env.mock_all_auths();

    client.initialize(&admin);

    let property_id = String::from_str(&env, "PROP-001");
    let metadata_hash = String::from_str(&env, "QmXoypizjW3WknFiJnKLwHCnL72vedxjQkDDP1mXWo6uco");

    let result = client.try_register_property(&landlord, &property_id, &metadata_hash);
    assert!(result.is_ok());

    let property = client.get_property(&property_id).unwrap();
    assert_eq!(property.property_id, property_id);
    assert_eq!(property.landlord, landlord);
    assert_eq!(property.metadata_hash, metadata_hash);
    assert!(!property.verified);
    assert!(property.verified_at.is_none());

    assert!(client.has_property(&property_id));
    assert_eq!(client.get_property_count(), 1);
}

#[test]
#[should_panic]
fn test_register_property_fails_without_landlord_auth() {
    let env = Env::default();
    let client = create_contract(&env);

    let admin = Address::generate(&env);
    let landlord = Address::generate(&env);

    env.mock_all_auths();
    client.initialize(&admin);

    env.mock_auths(&[]);

    let property_id = String::from_str(&env, "PROP-001");
    let metadata_hash = String::from_str(&env, "QmXoypizjW3WknFiJnKLwHCnL72vedxjQkDDP1mXWo6uco");

    client.register_property(&landlord, &property_id, &metadata_hash);
}

#[test]
#[should_panic(expected = "Error(Contract, #2)")]
fn test_register_property_fails_if_not_initialized() {
    let env = Env::default();
    let client = create_contract(&env);

    let landlord = Address::generate(&env);

    env.mock_all_auths();

    let property_id = String::from_str(&env, "PROP-001");
    let metadata_hash = String::from_str(&env, "QmXoypizjW3WknFiJnKLwHCnL72vedxjQkDDP1mXWo6uco");

    client.register_property(&landlord, &property_id, &metadata_hash);
}

#[test]
#[should_panic(expected = "Error(Contract, #3)")]
fn test_register_property_fails_if_already_exists() {
    let env = Env::default();
    let client = create_contract(&env);

    let admin = Address::generate(&env);
    let landlord = Address::generate(&env);

    env.mock_all_auths();

    client.initialize(&admin);

    let property_id = String::from_str(&env, "PROP-001");
    let metadata_hash = String::from_str(&env, "QmXoypizjW3WknFiJnKLwHCnL72vedxjQkDDP1mXWo6uco");

    client.register_property(&landlord, &property_id, &metadata_hash);
    client.register_property(&landlord, &property_id, &metadata_hash);
}

#[test]
#[should_panic(expected = "Error(Contract, #7)")]
fn test_register_property_fails_with_empty_property_id() {
    let env = Env::default();
    let client = create_contract(&env);

    let admin = Address::generate(&env);
    let landlord = Address::generate(&env);

    env.mock_all_auths();

    client.initialize(&admin);

    let property_id = String::from_str(&env, "");
    let metadata_hash = String::from_str(&env, "QmXoypizjW3WknFiJnKLwHCnL72vedxjQkDDP1mXWo6uco");

    client.register_property(&landlord, &property_id, &metadata_hash);
}

#[test]
#[should_panic(expected = "Error(Contract, #8)")]
fn test_register_property_fails_with_empty_metadata() {
    let env = Env::default();
    let client = create_contract(&env);

    let admin = Address::generate(&env);
    let landlord = Address::generate(&env);

    env.mock_all_auths();

    client.initialize(&admin);

    let property_id = String::from_str(&env, "PROP-001");
    let metadata_hash = String::from_str(&env, "");

    client.register_property(&landlord, &property_id, &metadata_hash);
}

#[test]
fn test_verify_property_success() {
    let env = Env::default();
    let client = create_contract(&env);

    let admin = Address::generate(&env);
    let landlord = Address::generate(&env);

    env.mock_all_auths();

    client.initialize(&admin);

    let property_id = String::from_str(&env, "PROP-001");
    let metadata_hash = String::from_str(&env, "QmXoypizjW3WknFiJnKLwHCnL72vedxjQkDDP1mXWo6uco");

    client.register_property(&landlord, &property_id, &metadata_hash);

    let result = client.try_verify_property(&admin, &property_id);
    assert!(result.is_ok());

    let property = client.get_property(&property_id).unwrap();
    assert!(property.verified);
    assert!(property.verified_at.is_some());
}

#[test]
#[should_panic]
fn test_verify_property_fails_without_admin_auth() {
    let env = Env::default();
    let client = create_contract(&env);

    let admin = Address::generate(&env);
    let landlord = Address::generate(&env);

    env.mock_all_auths();

    client.initialize(&admin);

    let property_id = String::from_str(&env, "PROP-001");
    let metadata_hash = String::from_str(&env, "QmXoypizjW3WknFiJnKLwHCnL72vedxjQkDDP1mXWo6uco");

    client.register_property(&landlord, &property_id, &metadata_hash);

    env.mock_auths(&[]);

    client.verify_property(&admin, &property_id);
}

#[test]
#[should_panic(expected = "Error(Contract, #5)")]
fn test_verify_property_fails_if_not_admin() {
    let env = Env::default();
    let client = create_contract(&env);

    let admin = Address::generate(&env);
    let landlord = Address::generate(&env);
    let non_admin = Address::generate(&env);

    env.mock_all_auths();

    client.initialize(&admin);

    let property_id = String::from_str(&env, "PROP-001");
    let metadata_hash = String::from_str(&env, "QmXoypizjW3WknFiJnKLwHCnL72vedxjQkDDP1mXWo6uco");

    client.register_property(&landlord, &property_id, &metadata_hash);
    client.verify_property(&non_admin, &property_id);
}

#[test]
#[should_panic(expected = "Error(Contract, #4)")]
fn test_verify_property_fails_if_property_not_found() {
    let env = Env::default();
    let client = create_contract(&env);

    let admin = Address::generate(&env);

    env.mock_all_auths();

    client.initialize(&admin);

    let property_id = String::from_str(&env, "PROP-NONEXISTENT");

    client.verify_property(&admin, &property_id);
}

#[test]
#[should_panic(expected = "Error(Contract, #6)")]
fn test_verify_property_fails_if_already_verified() {
    let env = Env::default();
    let client = create_contract(&env);

    let admin = Address::generate(&env);
    let landlord = Address::generate(&env);

    env.mock_all_auths();

    client.initialize(&admin);

    let property_id = String::from_str(&env, "PROP-001");
    let metadata_hash = String::from_str(&env, "QmXoypizjW3WknFiJnKLwHCnL72vedxjQkDDP1mXWo6uco");

    client.register_property(&landlord, &property_id, &metadata_hash);
    client.verify_property(&admin, &property_id);
    client.verify_property(&admin, &property_id);
}

#[test]
fn test_get_property_returns_none_for_nonexistent() {
    let env = Env::default();
    let client = create_contract(&env);

    let admin = Address::generate(&env);

    env.mock_all_auths();

    client.initialize(&admin);

    let property_id = String::from_str(&env, "PROP-NONEXISTENT");

    let result = client.get_property(&property_id);
    assert!(result.is_none());
}

#[test]
fn test_has_property_returns_false_for_nonexistent() {
    let env = Env::default();
    let client = create_contract(&env);

    let admin = Address::generate(&env);

    env.mock_all_auths();

    client.initialize(&admin);

    let property_id = String::from_str(&env, "PROP-NONEXISTENT");

    let result = client.has_property(&property_id);
    assert!(!result);
}

#[test]
fn test_property_count_increments() {
    let env = Env::default();
    let client = create_contract(&env);

    let admin = Address::generate(&env);
    let landlord = Address::generate(&env);

    env.mock_all_auths();

    client.initialize(&admin);

    assert_eq!(client.get_property_count(), 0);

    let property_id_1 = String::from_str(&env, "PROP-001");
    let property_id_2 = String::from_str(&env, "PROP-002");
    let metadata_hash = String::from_str(&env, "QmXoypizjW3WknFiJnKLwHCnL72vedxjQkDDP1mXWo6uco");

    client.register_property(&landlord, &property_id_1, &metadata_hash);
    assert_eq!(client.get_property_count(), 1);

    client.register_property(&landlord, &property_id_2, &metadata_hash);
    assert_eq!(client.get_property_count(), 2);
}

#[test]
fn test_multiple_landlords_can_register_properties() {
    let env = Env::default();
    let client = create_contract(&env);

    let admin = Address::generate(&env);
    let landlord1 = Address::generate(&env);
    let landlord2 = Address::generate(&env);

    env.mock_all_auths();

    client.initialize(&admin);

    let property_id_1 = String::from_str(&env, "PROP-001");
    let property_id_2 = String::from_str(&env, "PROP-002");
    let metadata_hash = String::from_str(&env, "QmXoypizjW3WknFiJnKLwHCnL72vedxjQkDDP1mXWo6uco");

    client.register_property(&landlord1, &property_id_1, &metadata_hash);
    client.register_property(&landlord2, &property_id_2, &metadata_hash);

    let prop1 = client.get_property(&property_id_1).unwrap();
    let prop2 = client.get_property(&property_id_2).unwrap();

    assert_eq!(prop1.landlord, landlord1);
    assert_eq!(prop2.landlord, landlord2);
    assert_eq!(client.get_property_count(), 2);
}

#[test]
fn test_registered_at_timestamp() {
    let env = Env::default();
    env.ledger().with_mut(|ledger| {
        ledger.timestamp = 1000;
    });

    let client = create_contract(&env);

    let admin = Address::generate(&env);
    let landlord = Address::generate(&env);

    env.mock_all_auths();

    client.initialize(&admin);

    let property_id = String::from_str(&env, "PROP-001");
    let metadata_hash = String::from_str(&env, "QmXoypizjW3WknFiJnKLwHCnL72vedxjQkDDP1mXWo6uco");

    client.register_property(&landlord, &property_id, &metadata_hash);

    let property = client.get_property(&property_id).unwrap();
    assert_eq!(property.registered_at, 1000);
}

#[test]
fn test_verified_at_timestamp() {
    let env = Env::default();
    env.ledger().with_mut(|ledger| {
        ledger.timestamp = 1000;
    });

    let client = create_contract(&env);

    let admin = Address::generate(&env);
    let landlord = Address::generate(&env);

    env.mock_all_auths();

    client.initialize(&admin);

    let property_id = String::from_str(&env, "PROP-001");
    let metadata_hash = String::from_str(&env, "QmXoypizjW3WknFiJnKLwHCnL72vedxjQkDDP1mXWo6uco");

    client.register_property(&landlord, &property_id, &metadata_hash);

    env.ledger().with_mut(|ledger| {
        ledger.timestamp = 2000;
    });

    client.verify_property(&admin, &property_id);

    let property = client.get_property(&property_id).unwrap();
    assert_eq!(property.verified_at, Some(2000));
}

// ─── Issue #649: Property Registration & Verification Tests ───────────────────

#[test]
fn test_register_property_with_various_types() {
    let env = Env::default();
    let client = create_contract(&env);

    let admin = Address::generate(&env);
    let landlord = Address::generate(&env);

    env.mock_all_auths();

    client.initialize(&admin);

    let property_types = [
        ("APARTMENT-001", "QmApartment001"),
        ("HOUSE-001", "QmHouse001"),
        ("COMMERCIAL-001", "QmCommercial001"),
    ];

    for (prop_id, metadata) in property_types.iter() {
        let property_id = String::from_str(&env, prop_id);
        let metadata_hash = String::from_str(&env, metadata);

        let result = client.try_register_property(&landlord, &property_id, &metadata_hash);
        assert!(result.is_ok());

        let property = client.get_property(&property_id).unwrap();
        assert_eq!(property.property_id, property_id);
        assert!(!property.verified);
    }

    assert_eq!(client.get_property_count(), 3);
}

#[test]
fn test_verify_property_updates_status() {
    let env = Env::default();
    let client = create_contract(&env);

    let admin = Address::generate(&env);
    let landlord = Address::generate(&env);

    env.mock_all_auths();

    client.initialize(&admin);

    let property_id = String::from_str(&env, "PROP-VERIFY-TEST");
    let metadata_hash = String::from_str(&env, "QmVerifyTest");

    client.register_property(&landlord, &property_id, &metadata_hash);

    let property_before = client.get_property(&property_id).unwrap();
    assert!(!property_before.verified);
    assert!(property_before.verified_at.is_none());

    client.verify_property(&admin, &property_id);

    let property_after = client.get_property(&property_id).unwrap();
    assert!(property_after.verified);
    assert!(property_after.verified_at.is_some());
}

#[test]
fn test_get_property_returns_all_fields() {
    let env = Env::default();
    let client = create_contract(&env);

    let admin = Address::generate(&env);
    let landlord = Address::generate(&env);

    env.mock_all_auths();
    env.ledger().with_mut(|li| li.timestamp = 1);

    client.initialize(&admin);

    let property_id = String::from_str(&env, "PROP-FIELDS-TEST");
    let metadata_hash = String::from_str(&env, "QmFieldsTest");

    client.register_property(&landlord, &property_id, &metadata_hash);

    let property = client.get_property(&property_id).unwrap();
    assert_eq!(property.property_id, property_id);
    assert_eq!(property.landlord, landlord);
    assert_eq!(property.metadata_hash, metadata_hash);
    assert!(!property.verified);
    assert!(property.registered_at > 0);
    assert!(property.verified_at.is_none());
}

#[test]
fn test_get_property_nonexistent_returns_none() {
    let env = Env::default();
    let client = create_contract(&env);

    let admin = Address::generate(&env);

    env.mock_all_auths();

    client.initialize(&admin);

    let nonexistent_id = String::from_str(&env, "NONEXISTENT-PROP");
    let result = client.get_property(&nonexistent_id);
    assert!(result.is_none());
}

#[test]
fn test_property_count_accuracy() {
    let env = Env::default();
    let client = create_contract(&env);

    let admin = Address::generate(&env);
    let landlord = Address::generate(&env);

    env.mock_all_auths();

    client.initialize(&admin);

    assert_eq!(client.get_property_count(), 0);

    for i in 0..5 {
        let property_id = match i {
            0 => String::from_str(&env, "PROP-0"),
            1 => String::from_str(&env, "PROP-1"),
            2 => String::from_str(&env, "PROP-2"),
            3 => String::from_str(&env, "PROP-3"),
            4 => String::from_str(&env, "PROP-4"),
            _ => String::from_str(&env, "PROP-5"),
        };
        let metadata_hash = match i {
            0 => String::from_str(&env, "QmMetadata0"),
            1 => String::from_str(&env, "QmMetadata1"),
            2 => String::from_str(&env, "QmMetadata2"),
            3 => String::from_str(&env, "QmMetadata3"),
            4 => String::from_str(&env, "QmMetadata4"),
            _ => String::from_str(&env, "QmMetadata5"),
        };
        client.register_property(&landlord, &property_id, &metadata_hash);
        assert_eq!(client.get_property_count(), (i + 1) as u32);
    }
}

// ─── Issue #649: Two-Step Transfer Tests ─────────────────────────────────────────

#[test]
fn test_propose_transfer_success() {
    let env = Env::default();
    let client = create_contract(&env);

    let admin = Address::generate(&env);
    let owner = Address::generate(&env);
    let new_owner = Address::generate(&env);

    env.mock_all_auths();

    client.initialize(&admin);

    let property_id = String::from_str(&env, "PROP-TRANSFER-001");
    let metadata_hash = String::from_str(&env, "QmTransfer001");

    client.register_property(&owner, &property_id, &metadata_hash);

    let result = client.try_propose_transfer(&property_id, &new_owner, &None);
    assert!(result.is_ok());

    let proposal = client.get_transfer_proposal(&property_id).unwrap();
    assert_eq!(proposal.property_id, property_id);
    assert_eq!(proposal.current_owner, owner);
    assert_eq!(proposal.proposed_new_owner, new_owner);
    assert!(proposal.escrow_case_id.is_none());

    // Owner should not change yet
    let property = client.get_property(&property_id).unwrap();
    assert_eq!(property.landlord, owner);
}

#[test]
#[should_panic]
fn test_propose_transfer_fails_without_owner_auth() {
    let env = Env::default();
    let client = create_contract(&env);

    let admin = Address::generate(&env);
    let owner = Address::generate(&env);
    let new_owner = Address::generate(&env);

    env.mock_all_auths();

    client.initialize(&admin);

    let property_id = String::from_str(&env, "PROP-TRANSFER-001");
    let metadata_hash = String::from_str(&env, "QmTransfer001");

    client.register_property(&owner, &property_id, &metadata_hash);

    env.mock_auths(&[]);

    client.propose_transfer(&property_id, &new_owner, &None);
}

#[test]
#[should_panic(expected = "Error(Contract, #4)")]
fn test_propose_transfer_fails_if_property_not_found() {
    let env = Env::default();
    let client = create_contract(&env);

    let admin = Address::generate(&env);
    let _owner = Address::generate(&env);
    let new_owner = Address::generate(&env);

    env.mock_all_auths();

    client.initialize(&admin);

    let property_id = String::from_str(&env, "PROP-NONEXISTENT");

    client.propose_transfer(&property_id, &new_owner, &None);
}

#[test]
#[should_panic(expected = "Error(Contract, #11)")]
fn test_propose_transfer_fails_if_new_owner_same_as_current() {
    let env = Env::default();
    let client = create_contract(&env);

    let admin = Address::generate(&env);
    let owner = Address::generate(&env);

    env.mock_all_auths();

    client.initialize(&admin);

    let property_id = String::from_str(&env, "PROP-TRANSFER-001");
    let metadata_hash = String::from_str(&env, "QmTransfer001");

    client.register_property(&owner, &property_id, &metadata_hash);

    client.propose_transfer(&property_id, &owner, &None);
}

#[test]
#[should_panic(expected = "Error(Contract, #9)")]
fn test_propose_transfer_fails_if_proposal_pending() {
    let env = Env::default();
    let client = create_contract(&env);

    let admin = Address::generate(&env);
    let owner = Address::generate(&env);
    let new_owner = Address::generate(&env);

    env.mock_all_auths();

    client.initialize(&admin);

    let property_id = String::from_str(&env, "PROP-TRANSFER-001");
    let metadata_hash = String::from_str(&env, "QmTransfer001");

    client.register_property(&owner, &property_id, &metadata_hash);

    client.propose_transfer(&property_id, &new_owner, &None);
    client.propose_transfer(&property_id, &new_owner, &None);
}

#[test]
fn test_accept_transfer_success() {
    let env = Env::default();
    let client = create_contract(&env);

    let admin = Address::generate(&env);
    let owner = Address::generate(&env);
    let new_owner = Address::generate(&env);

    env.mock_all_auths();

    client.initialize(&admin);

    let property_id = String::from_str(&env, "PROP-TRANSFER-001");
    let metadata_hash = String::from_str(&env, "QmTransfer001");

    client.register_property(&owner, &property_id, &metadata_hash);
    client.propose_transfer(&property_id, &new_owner, &None);

    // Verify proposal exists before acceptance
    let proposal_before = client.get_transfer_proposal(&property_id);
    assert!(proposal_before.is_some());

    // New owner accepts the transfer
    let result = client.try_accept_transfer(&property_id);
    assert!(result.is_ok());

    // Proposal should be cleared
    let proposal_after = client.get_transfer_proposal(&property_id);
    assert!(proposal_after.is_none());

    // Owner should be updated
    let property = client.get_property(&property_id).unwrap();
    assert_eq!(property.landlord, new_owner);
}

#[test]
fn test_accept_transfer_unaccepted_doesnt_change_owner() {
    let env = Env::default();
    let client = create_contract(&env);

    let admin = Address::generate(&env);
    let owner = Address::generate(&env);
    let new_owner = Address::generate(&env);

    env.mock_all_auths();

    client.initialize(&admin);

    let property_id = String::from_str(&env, "PROP-TRANSFER-001");
    let metadata_hash = String::from_str(&env, "QmTransfer001");

    client.register_property(&owner, &property_id, &metadata_hash);
    client.propose_transfer(&property_id, &new_owner, &None);

    // Before acceptance, owner should still be the original owner
    let property_before = client.get_property(&property_id).unwrap();
    assert_eq!(property_before.landlord, owner);
}

#[test]
#[should_panic]
fn test_accept_transfer_fails_without_new_owner_auth() {
    let env = Env::default();
    let client = create_contract(&env);

    let admin = Address::generate(&env);
    let owner = Address::generate(&env);
    let new_owner = Address::generate(&env);

    env.mock_all_auths();

    client.initialize(&admin);

    let property_id = String::from_str(&env, "PROP-TRANSFER-001");
    let metadata_hash = String::from_str(&env, "QmTransfer001");

    client.register_property(&owner, &property_id, &metadata_hash);
    client.propose_transfer(&property_id, &new_owner, &None);

    env.mock_auths(&[]);

    client.accept_transfer(&property_id);
}

#[test]
#[should_panic(expected = "Error(Contract, #10)")]
fn test_accept_transfer_fails_if_no_proposal() {
    let env = Env::default();
    let client = create_contract(&env);

    let admin = Address::generate(&env);
    let owner = Address::generate(&env);
    let _new_owner = Address::generate(&env);

    env.mock_all_auths();

    client.initialize(&admin);

    let property_id = String::from_str(&env, "PROP-TRANSFER-001");
    let metadata_hash = String::from_str(&env, "QmTransfer001");

    client.register_property(&owner, &property_id, &metadata_hash);

    // Try to accept without proposing
    client.accept_transfer(&property_id);
}

#[test]
fn test_cancel_transfer_success() {
    let env = Env::default();
    let client = create_contract(&env);

    let admin = Address::generate(&env);
    let owner = Address::generate(&env);
    let new_owner = Address::generate(&env);

    env.mock_all_auths();

    client.initialize(&admin);

    let property_id = String::from_str(&env, "PROP-TRANSFER-001");
    let metadata_hash = String::from_str(&env, "QmTransfer001");

    client.register_property(&owner, &property_id, &metadata_hash);
    client.propose_transfer(&property_id, &new_owner, &None);

    // Verify proposal exists
    let proposal_before = client.get_transfer_proposal(&property_id);
    assert!(proposal_before.is_some());

    // Owner cancels the transfer
    let result = client.try_cancel_transfer(&property_id);
    assert!(result.is_ok());

    // Proposal should be cleared
    let proposal_after = client.get_transfer_proposal(&property_id);
    assert!(proposal_after.is_none());

    // Owner should remain the same
    let property = client.get_property(&property_id).unwrap();
    assert_eq!(property.landlord, owner);
}

#[test]
#[should_panic]
fn test_cancel_transfer_fails_without_owner_auth() {
    let env = Env::default();
    let client = create_contract(&env);

    let admin = Address::generate(&env);
    let owner = Address::generate(&env);
    let new_owner = Address::generate(&env);

    env.mock_all_auths();

    client.initialize(&admin);

    let property_id = String::from_str(&env, "PROP-TRANSFER-001");
    let metadata_hash = String::from_str(&env, "QmTransfer001");

    client.register_property(&owner, &property_id, &metadata_hash);
    client.propose_transfer(&property_id, &new_owner, &None);

    env.mock_auths(&[]);

    client.cancel_transfer(&property_id);
}

#[test]
#[should_panic(expected = "Error(Contract, #10)")]
fn test_cancel_transfer_fails_if_no_proposal() {
    let env = Env::default();
    let client = create_contract(&env);

    let admin = Address::generate(&env);
    let owner = Address::generate(&env);

    env.mock_all_auths();

    client.initialize(&admin);

    let property_id = String::from_str(&env, "PROP-TRANSFER-001");
    let metadata_hash = String::from_str(&env, "QmTransfer001");

    client.register_property(&owner, &property_id, &metadata_hash);

    // Try to cancel without proposing
    client.cancel_transfer(&property_id);
}

#[test]
fn test_propose_transfer_with_escrow_case() {
    let env = Env::default();
    let client = create_contract(&env);

    let admin = Address::generate(&env);
    let owner = Address::generate(&env);
    let new_owner = Address::generate(&env);

    env.mock_all_auths();

    client.initialize(&admin);

    let property_id = String::from_str(&env, "PROP-TRANSFER-001");
    let metadata_hash = String::from_str(&env, "QmTransfer001");
    let escrow_case_id = String::from_str(&env, "ESCROW-123");

    client.register_property(&owner, &property_id, &metadata_hash);

    let result =
        client.try_propose_transfer(&property_id, &new_owner, &Some(escrow_case_id.clone()));
    assert!(result.is_ok());

    let proposal = client.get_transfer_proposal(&property_id).unwrap();
    assert_eq!(proposal.escrow_case_id, Some(escrow_case_id));
}

#[test]
fn test_transfer_proposal_blocks_direct_overwrite() {
    let env = Env::default();
    let client = create_contract(&env);

    let admin = Address::generate(&env);
    let owner = Address::generate(&env);
    let new_owner = Address::generate(&env);
    let another_owner = Address::generate(&env);

    env.mock_all_auths();

    client.initialize(&admin);

    let property_id = String::from_str(&env, "PROP-TRANSFER-001");
    let metadata_hash = String::from_str(&env, "QmTransfer001");

    client.register_property(&owner, &property_id, &metadata_hash);
    client.propose_transfer(&property_id, &new_owner, &None);

    // Now owner has proposed a transfer. Trying to propose another transfer should fail.
    let result = client.try_propose_transfer(&property_id, &another_owner, &None);
    assert!(result.is_err());
}

#[test]
fn test_multiple_properties_can_have_concurrent_transfers() {
    let env = Env::default();
    let client = create_contract(&env);

    let admin = Address::generate(&env);
    let owner1 = Address::generate(&env);
    let owner2 = Address::generate(&env);
    let new_owner1 = Address::generate(&env);
    let new_owner2 = Address::generate(&env);

    env.mock_all_auths();

    client.initialize(&admin);

    let property_id_1 = String::from_str(&env, "PROP-001");
    let property_id_2 = String::from_str(&env, "PROP-002");
    let metadata_hash = String::from_str(&env, "QmMetadata");

    client.register_property(&owner1, &property_id_1, &metadata_hash);
    client.register_property(&owner2, &property_id_2, &metadata_hash);

    // Both can have concurrent transfer proposals
    client.propose_transfer(&property_id_1, &new_owner1, &None);
    client.propose_transfer(&property_id_2, &new_owner2, &None);

    let proposal_1 = client.get_transfer_proposal(&property_id_1).unwrap();
    let proposal_2 = client.get_transfer_proposal(&property_id_2).unwrap();

    assert_eq!(proposal_1.proposed_new_owner, new_owner1);
    assert_eq!(proposal_2.proposed_new_owner, new_owner2);
}

#[test]
fn test_cancel_then_propose_new_transfer() {
    let env = Env::default();
    let client = create_contract(&env);

    let admin = Address::generate(&env);
    let owner = Address::generate(&env);
    let new_owner_1 = Address::generate(&env);
    let new_owner_2 = Address::generate(&env);

    env.mock_all_auths();

    client.initialize(&admin);

    let property_id = String::from_str(&env, "PROP-TRANSFER-001");
    let metadata_hash = String::from_str(&env, "QmTransfer001");

    client.register_property(&owner, &property_id, &metadata_hash);

    // First transfer proposal
    client.propose_transfer(&property_id, &new_owner_1, &None);
    let proposal_1 = client.get_transfer_proposal(&property_id).unwrap();
    assert_eq!(proposal_1.proposed_new_owner, new_owner_1);

    // Cancel it
    client.cancel_transfer(&property_id);
    let proposal_after_cancel = client.get_transfer_proposal(&property_id);
    assert!(proposal_after_cancel.is_none());

    // Propose a new transfer to a different owner
    client.propose_transfer(&property_id, &new_owner_2, &None);
    let proposal_2 = client.get_transfer_proposal(&property_id).unwrap();
    assert_eq!(proposal_2.proposed_new_owner, new_owner_2);
}
