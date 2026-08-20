#![cfg(test)]

use soroban_sdk::testutils::Address as AddressTestUtils;
use soroban_sdk::{vec, Env, String};

use crate::payment_impl::{
    calculate_fee_splits, get_fee_split_config, set_fee_split_config,
    validate_fee_split_config,
};
use crate::types::{FeeSplitRecipient, PaymentError};

/// Helper function to create test addresses
fn create_test_address(env: &Env, seed: &str) -> soroban_sdk::Address {
    AddressTestUtils::generate(env)
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
fn test_validate_fee_split_config_too_many_recipients() {
    let env = Env::default();
    let mut recipients = vec![&env];

    // Add 11 recipients (exceeds limit of 10)
    for i in 0..11 {
        recipients.push_back(FeeSplitRecipient {
            address: create_test_address(&env, &format!("addr_{}", i)),
            basis_points: 909, // Will total ~10000 but should fail first on count
        });
    }

    // Adjust last recipient to make total 10000
    if recipients.len() > 0 {
        // This will fail due to too many recipients before checking total
        assert_eq!(
            validate_fee_split_config(&recipients),
            Err(PaymentError::TooManyFeeSplitRecipients)
        );
    }
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
fn test_calculate_fee_splits_equal_split() {
    let env = Env::default();

    let recipient1 = FeeSplitRecipient {
        address: create_test_address(&env, "1"),
        basis_points: 5000,
    };

    let recipient2 = FeeSplitRecipient {
        address: create_test_address(&env, "2"),
        basis_points: 5000,
    };

    let recipients = vec![&env, recipient1.clone(), recipient2.clone()];

    let total_amount: i128 = 1000;
    let splits = calculate_fee_splits(&total_amount, &recipients);

    // Should split evenly: 500 each
    assert_eq!(splits.len(), 2);

    let (addr1, amount1) = splits.get(0).unwrap();
    let (addr2, amount2) = splits.get(1).unwrap();

    assert_eq!(*addr1, recipient1.address);
    assert_eq!(*amount1, 500);

    assert_eq!(*addr2, recipient2.address);
    assert_eq!(*amount2, 500);

    // Verify total is exact
    assert_eq!(amount1 + amount2, total_amount);
}

#[test]
fn test_calculate_fee_splits_with_rounding() {
    let env = Env::default();

    let recipient1 = FeeSplitRecipient {
        address: create_test_address(&env, "1"),
        basis_points: 3333, // 33.33%
    };

    let recipient2 = FeeSplitRecipient {
        address: create_test_address(&env, "2"),
        basis_points: 3333, // 33.33%
    };

    let recipient3 = FeeSplitRecipient {
        address: create_test_address(&env, "3"),
        basis_points: 3334, // 33.34%
    };

    let recipients = vec![&env, recipient1.clone(), recipient2.clone(), recipient3.clone()];

    let total_amount: i128 = 1000;
    let splits = calculate_fee_splits(&total_amount, &recipients);

    assert_eq!(splits.len(), 3);

    let (addr1, amount1) = splits.get(0).unwrap();
    let (addr2, amount2) = splits.get(1).unwrap();
    let (addr3, amount3) = splits.get(2).unwrap();

    // Verify addresses
    assert_eq!(*addr1, recipient1.address);
    assert_eq!(*addr2, recipient2.address);
    assert_eq!(*addr3, recipient3.address);

    // Verify amounts sum to total (with rounding to last recipient)
    assert_eq!(amount1 + amount2 + amount3, total_amount);

    // First two should be calculated, last gets remainder
    assert_eq!(*amount1, 333);
    assert_eq!(*amount2, 333);
    assert_eq!(*amount3, 334);
}

#[test]
fn test_calculate_fee_splits_three_way() {
    let env = Env::default();

    let recipient1 = FeeSplitRecipient {
        address: create_test_address(&env, "1"),
        basis_points: 2500, // 25%
    };

    let recipient2 = FeeSplitRecipient {
        address: create_test_address(&env, "2"),
        basis_points: 2500, // 25%
    };

    let recipient3 = FeeSplitRecipient {
        address: create_test_address(&env, "3"),
        basis_points: 5000, // 50%
    };

    let recipients = vec![&env, recipient1.clone(), recipient2.clone(), recipient3.clone()];

    let total_amount: i128 = 10000;
    let splits = calculate_fee_splits(&total_amount, &recipients);

    assert_eq!(splits.len(), 3);

    let (_, amount1) = splits.get(0).unwrap();
    let (_, amount2) = splits.get(1).unwrap();
    let (_, amount3) = splits.get(2).unwrap();

    assert_eq!(*amount1, 2500);
    assert_eq!(*amount2, 2500);
    assert_eq!(*amount3, 5000);

    // Verify exact distribution
    assert_eq!(amount1 + amount2 + amount3, total_amount);
}

#[test]
fn test_calculate_fee_splits_large_amount() {
    let env = Env::default();

    let recipient1 = FeeSplitRecipient {
        address: create_test_address(&env, "1"),
        basis_points: 6000, // 60%
    };

    let recipient2 = FeeSplitRecipient {
        address: create_test_address(&env, "2"),
        basis_points: 4000, // 40%
    };

    let recipients = vec![&env, recipient1.clone(), recipient2.clone()];

    let total_amount: i128 = 1_000_000_000; // 1 billion
    let splits = calculate_fee_splits(&total_amount, &recipients);

    let (_, amount1) = splits.get(0).unwrap();
    let (_, amount2) = splits.get(1).unwrap();

    assert_eq!(*amount1, 600_000_000);
    assert_eq!(*amount2, 400_000_000);

    // Verify exact distribution
    assert_eq!(amount1 + amount2, total_amount);
}

#[test]
fn test_set_and_get_fee_split_config() {
    let env = Env::default();

    let recipient1 = FeeSplitRecipient {
        address: create_test_address(&env, "1"),
        basis_points: 5000,
    };

    let recipient2 = FeeSplitRecipient {
        address: create_test_address(&env, "2"),
        basis_points: 5000,
    };

    let recipients = vec![&env, recipient1.clone(), recipient2.clone()];

    let config_id = String::from_str(&env, "config_1");
    let agreement_id = String::from_str(&env, "agreement_1");

    // Set the config
    let result = set_fee_split_config(env.clone(), config_id.clone(), agreement_id.clone(), recipients.clone());
    assert!(result.is_ok());

    // Get the config back
    let retrieved = get_fee_split_config(&env, &agreement_id);
    assert!(retrieved.is_ok());

    let config = retrieved.unwrap();
    assert_eq!(config.agreement_id, agreement_id);
    assert_eq!(config.recipients.len(), 2);
    assert_eq!(config.active, true);
}

#[test]
fn test_set_fee_split_config_validation_fails() {
    let env = Env::default();

    let recipient1 = FeeSplitRecipient {
        address: create_test_address(&env, "1"),
        basis_points: 7000, // 70% - doesn't sum to 100%
    };

    let recipients = vec![&env, recipient1];

    let config_id = String::from_str(&env, "config_1");
    let agreement_id = String::from_str(&env, "agreement_1");

    // Should fail validation
    let result = set_fee_split_config(env.clone(), config_id, agreement_id, recipients);
    assert_eq!(result, Err(PaymentError::InvalidFeeSplitTotal));
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

    let recipients = vec![&env, recipient.clone()];

    // Should validate successfully
    assert!(validate_fee_split_config(&recipients).is_ok());

    // Should split entire amount to single recipient
    let total_amount: i128 = 5000;
    let splits = calculate_fee_splits(&total_amount, &recipients);

    assert_eq!(splits.len(), 1);
    let (addr, amount) = splits.get(0).unwrap();
    assert_eq!(*addr, recipient.address);
    assert_eq!(*amount, 5000);
}

#[test]
fn test_rounding_consistency() {
    let env = Env::default();

    // Create a split that will require rounding
    let recipients = vec![
        &env,
        FeeSplitRecipient {
            address: create_test_address(&env, "1"),
            basis_points: 3333, // 33.33%
        },
        FeeSplitRecipient {
            address: create_test_address(&env, "2"),
            basis_points: 3333, // 33.33%
        },
        FeeSplitRecipient {
            address: create_test_address(&env, "3"),
            basis_points: 3334, // 33.34%
        },
    ];

    let amounts = [100, 1000, 10000, 1000000];

    for amount in amounts.iter() {
        let splits = calculate_fee_splits(amount, &recipients);
        let total: i128 = splits.iter().map(|(_, a)| a).sum();

        // Every split must sum exactly to original amount
        assert_eq!(
            total, *amount,
            "Rounding error for amount {}: sum is {}",
            amount, total
        );
    }
}
