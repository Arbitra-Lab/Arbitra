#![cfg(test)]

use soroban_sdk::testutils::Address as AddressTestUtils;
use soroban_sdk::{vec, Env};

use crate::payment_impl::validate_fee_split_config;
use crate::types::FeeSplitRecipient;
use crate::PaymentError;

/// Helper function to create test addresses
fn create_test_address(env: &Env, _seed: &str) -> soroban_sdk::Address {
    <soroban_sdk::Address as AddressTestUtils>::generate(env)
}

#[test]
fn test_validate_fee_split_config_valid() {
    let env = Env::default();

    let recipient1 = FeeSplitRecipient {
        address: create_test_address(&env, "1"),
        basis_points: 5000,
    };

    let recipient2 = FeeSplitRecipient {
        address: create_test_address(&env, "2"),
        basis_points: 5000,
    };

    let recipients = vec![&env, recipient1, recipient2];

    // Should succeed with 50/50 split
    assert!(validate_fee_split_config(&recipients).is_ok());
}

#[test]
fn test_validate_fee_split_config_invalid_total() {
    let env = Env::default();

    let recipient1 = FeeSplitRecipient {
        address: create_test_address(&env, "1"),
        basis_points: 6000, // 60%
    };

    let recipient2 = FeeSplitRecipient {
        address: create_test_address(&env, "2"),
        basis_points: 3000, // 30% - total only 90%
    };

    let recipients = vec![&env, recipient1, recipient2];

    // Should fail - total is 90%, not 100%
    assert_eq!(
        validate_fee_split_config(&recipients),
        Err(PaymentError::InvalidFeeSplitTotal)
    );
}

#[test]
fn test_validate_fee_split_config_empty_recipients() {
    let env = Env::default();
    let recipients: soroban_sdk::Vec<FeeSplitRecipient> = vec![&env];

    // Should fail - no recipients
    assert_eq!(
        validate_fee_split_config(&recipients),
        Err(PaymentError::EmptyFeeSplitRecipients)
    );
}

#[test]
fn test_validate_fee_split_config_invalid_basis_points() {
    let env = Env::default();

    let recipient1 = FeeSplitRecipient {
        address: create_test_address(&env, "1"),
        basis_points: 10001, // > 10000
    };

    let recipients = vec![&env, recipient1];

    // Should fail - basis points exceed 10000
    assert_eq!(
        validate_fee_split_config(&recipients),
        Err(PaymentError::InvalidRecipientBasisPoints)
    );
}

#[test]
fn test_validate_fee_split_config_duplicate_recipient() {
    let env = Env::default();
    let shared_address = create_test_address(&env, "shared");

    let recipient1 = FeeSplitRecipient {
        address: shared_address.clone(),
        basis_points: 5000,
    };

    let recipient2 = FeeSplitRecipient {
        address: shared_address.clone(),
        basis_points: 5000,
    };

    let recipients = vec![&env, recipient1, recipient2];

    // Should fail - duplicate recipients
    assert_eq!(
        validate_fee_split_config(&recipients),
        Err(PaymentError::DuplicateFeeSplitRecipient)
    );
}

#[test]
fn test_three_way_split_validation() {
    let env = Env::default();

    // Platform 40%, Arbiter 30%, Referrer 30%
    let recipient1 = FeeSplitRecipient {
        address: create_test_address(&env, "platform"),
        basis_points: 4000,
    };

    let recipient2 = FeeSplitRecipient {
        address: create_test_address(&env, "arbiter"),
        basis_points: 3000,
    };

    let recipient3 = FeeSplitRecipient {
        address: create_test_address(&env, "referrer"),
        basis_points: 3000,
    };

    let recipients = vec![&env, recipient1, recipient2, recipient3];

    // Should pass validation
    assert!(validate_fee_split_config(&recipients).is_ok());
}

#[test]
fn test_single_recipient_100_percent() {
    let env = Env::default();

    let recipient = FeeSplitRecipient {
        address: create_test_address(&env, "single"),
        basis_points: 10000, // 100%
    };

    let recipients = vec![&env, recipient];

    // Should validate successfully
    assert!(validate_fee_split_config(&recipients).is_ok());
}
