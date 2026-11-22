use crate::rate_limit;
use crate::storage::DataKey;
use crate::types::RateLimitConfig;
use soroban_sdk::{
    testutils::{Address as _, Ledger},
    Address, Env,
};

use crate::DisputeResolutionContract;

fn setup() -> (Env, Address, Address) {
    let env = Env::default();
    let contract_id = env.register(DisputeResolutionContract, ());
    let user = Address::generate(&env);
    (env, contract_id, user)
}

fn seed_config(env: &Env, contract_id: &Address, config: &RateLimitConfig) {
    env.as_contract(contract_id, || {
        env.storage()
            .persistent()
            .set(&DataKey::RateLimitConfig, config);
    });
}

#[test]
fn test_rate_limit_config_default() {
    let (env, contract_id, _user) = setup();

    let config = env.as_contract(&contract_id, || rate_limit::get_rate_limit_config(&env));
    assert_eq!(config.max_calls_per_block, 10);
    assert_eq!(config.max_calls_per_user_per_day, 100);
    assert_eq!(config.cooldown_blocks, 0);
}

#[test]
fn test_check_rate_limit_within_limit() {
    let (env, contract_id, user) = setup();

    seed_config(
        &env,
        &contract_id,
        &RateLimitConfig {
            max_calls_per_block: 10,
            max_calls_per_user_per_day: 5,
            cooldown_blocks: 0,
        },
    );

    for _ in 0..3 {
        let result = env.as_contract(&contract_id, || {
            rate_limit::check_rate_limit(&env, &user, "raise_dispute")
        });
        assert!(result.is_ok());
    }
}

#[test]
fn test_check_rate_limit_exceed_block() {
    let (env, contract_id, _user) = setup();

    seed_config(
        &env,
        &contract_id,
        &RateLimitConfig {
            max_calls_per_block: 2,
            max_calls_per_user_per_day: 100,
            cooldown_blocks: 0,
        },
    );

    let user1 = Address::generate(&env);
    let user2 = Address::generate(&env);
    let user3 = Address::generate(&env);

    let r1 = env.as_contract(&contract_id, || {
        rate_limit::check_rate_limit(&env, &user1, "raise_dispute")
    });
    assert!(r1.is_ok());

    let r2 = env.as_contract(&contract_id, || {
        rate_limit::check_rate_limit(&env, &user2, "raise_dispute")
    });
    assert!(r2.is_ok());

    let r3 = env.as_contract(&contract_id, || {
        rate_limit::check_rate_limit(&env, &user3, "raise_dispute")
    });
    assert!(r3.is_err());
}

#[test]
fn test_check_rate_limit_exceed_daily() {
    let (env, contract_id, user) = setup();

    seed_config(
        &env,
        &contract_id,
        &RateLimitConfig {
            max_calls_per_block: 100,
            max_calls_per_user_per_day: 2,
            cooldown_blocks: 0,
        },
    );

    let r1 = env.as_contract(&contract_id, || {
        rate_limit::check_rate_limit(&env, &user, "raise_dispute")
    });
    assert!(r1.is_ok());

    env.ledger().with_mut(|li| li.sequence_number += 1);

    let r2 = env.as_contract(&contract_id, || {
        rate_limit::check_rate_limit(&env, &user, "raise_dispute")
    });
    assert!(r2.is_ok());

    env.ledger().with_mut(|li| li.sequence_number += 1);

    let r3 = env.as_contract(&contract_id, || {
        rate_limit::check_rate_limit(&env, &user, "raise_dispute")
    });
    assert!(r3.is_err());
}

#[test]
fn test_check_rate_limit_cooldown() {
    let (env, contract_id, user) = setup();

    seed_config(
        &env,
        &contract_id,
        &RateLimitConfig {
            max_calls_per_block: 100,
            max_calls_per_user_per_day: 100,
            cooldown_blocks: 10,
        },
    );

    // Start at block 1 so last_call_block is nonzero after the first call
    env.ledger().with_mut(|li| li.sequence_number = 1);

    let r1 = env.as_contract(&contract_id, || {
        rate_limit::check_rate_limit(&env, &user, "raise_dispute")
    });
    assert!(r1.is_ok());

    // Same block => cooldown not met
    let r2 = env.as_contract(&contract_id, || {
        rate_limit::check_rate_limit(&env, &user, "raise_dispute")
    });
    assert!(r2.is_err());

    // Advance past cooldown
    env.ledger().with_mut(|li| li.sequence_number += 10);

    let r3 = env.as_contract(&contract_id, || {
        rate_limit::check_rate_limit(&env, &user, "raise_dispute")
    });
    assert!(r3.is_ok());
}

#[test]
fn test_rate_limit_daily_reset_after_17280_blocks() {
    let (env, contract_id, user) = setup();

    seed_config(
        &env,
        &contract_id,
        &RateLimitConfig {
            max_calls_per_block: 100,
            max_calls_per_user_per_day: 3,
            cooldown_blocks: 0,
        },
    );

    // Use up daily limit
    for _ in 0..3 {
        env.ledger().with_mut(|li| li.sequence_number += 1);
        let result = env.as_contract(&contract_id, || {
            rate_limit::check_rate_limit(&env, &user, "raise_dispute")
        });
        assert!(result.is_ok());
    }

    // Next call should fail (daily limit exceeded)
    env.ledger().with_mut(|li| li.sequence_number += 1);
    let result = env.as_contract(&contract_id, || {
        rate_limit::check_rate_limit(&env, &user, "raise_dispute")
    });
    assert!(result.is_err());

    // Advance by 17280 blocks (1 day) to reset daily counter
    env.ledger().with_mut(|li| li.sequence_number += 17280);

    // Should work again after daily reset
    let result = env.as_contract(&contract_id, || {
        rate_limit::check_rate_limit(&env, &user, "raise_dispute")
    });
    assert!(result.is_ok());
}

#[test]
fn test_rate_limit_multiple_users_independent_tracking() {
    let (env, contract_id, _user) = setup();

    seed_config(
        &env,
        &contract_id,
        &RateLimitConfig {
            max_calls_per_block: 100,
            max_calls_per_user_per_day: 2,
            cooldown_blocks: 5,
        },
    );

    let user_a = Address::generate(&env);
    let user_b = Address::generate(&env);
    let user_c = Address::generate(&env);

    env.ledger().with_mut(|li| li.sequence_number = 10);

    // User A makes 2 calls (max daily limit)
    for _ in 0..2 {
        env.ledger().with_mut(|li| li.sequence_number += 6);
        let result = env.as_contract(&contract_id, || {
            rate_limit::check_rate_limit(&env, &user_a, "raise_dispute")
        });
        assert!(result.is_ok());
    }

    // User A exceeds daily limit
    env.ledger().with_mut(|li| li.sequence_number += 6);
    let result = env.as_contract(&contract_id, || {
        rate_limit::check_rate_limit(&env, &user_a, "raise_dispute")
    });
    assert!(result.is_err());

    // User B should still be able to make calls (independent tracking)
    let result = env.as_contract(&contract_id, || {
        rate_limit::check_rate_limit(&env, &user_b, "raise_dispute")
    });
    assert!(result.is_ok());

    env.ledger().with_mut(|li| li.sequence_number += 6);
    let result = env.as_contract(&contract_id, || {
        rate_limit::check_rate_limit(&env, &user_b, "raise_dispute")
    });
    assert!(result.is_ok());

    // User C should also work independently
    let result = env.as_contract(&contract_id, || {
        rate_limit::check_rate_limit(&env, &user_c, "raise_dispute")
    });
    assert!(result.is_ok());
}

#[test]
fn test_rate_limit_different_actions_tracked_separately() {
    let (env, contract_id, user) = setup();

    seed_config(
        &env,
        &contract_id,
        &RateLimitConfig {
            max_calls_per_block: 100,
            max_calls_per_user_per_day: 2,
            cooldown_blocks: 0,
        },
    );

    // User makes 2 calls for "raise_dispute" (max daily limit)
    env.ledger().with_mut(|li| li.sequence_number = 10);
    let r1 = env.as_contract(&contract_id, || {
        rate_limit::check_rate_limit(&env, &user, "raise_dispute")
    });
    assert!(r1.is_ok());

    env.ledger().with_mut(|li| li.sequence_number += 1);
    let r2 = env.as_contract(&contract_id, || {
        rate_limit::check_rate_limit(&env, &user, "raise_dispute")
    });
    assert!(r2.is_ok());

    // Third call for "raise_dispute" should fail
    env.ledger().with_mut(|li| li.sequence_number += 1);
    let r3 = env.as_contract(&contract_id, || {
        rate_limit::check_rate_limit(&env, &user, "raise_dispute")
    });
    assert!(r3.is_err());

    // But calls for a different action should work (separate counter)
    let r4 = env.as_contract(&contract_id, || {
        rate_limit::check_rate_limit(&env, &user, "submit_evidence")
    });
    assert!(r4.is_ok());

    env.ledger().with_mut(|li| li.sequence_number += 1);
    let r5 = env.as_contract(&contract_id, || {
        rate_limit::check_rate_limit(&env, &user, "submit_evidence")
    });
    assert!(r5.is_ok());
}

#[test]
fn test_rate_limit_cooldown_exact_boundary() {
    let (env, contract_id, user) = setup();

    seed_config(
        &env,
        &contract_id,
        &RateLimitConfig {
            max_calls_per_block: 100,
            max_calls_per_user_per_day: 100,
            cooldown_blocks: 5,
        },
    );

    env.ledger().with_mut(|li| li.sequence_number = 100);

    // First call at block 100
    let r1 = env.as_contract(&contract_id, || {
        rate_limit::check_rate_limit(&env, &user, "raise_dispute")
    });
    assert!(r1.is_ok());

    // Advance to block 104 (4 blocks later - still within cooldown)
    env.ledger().with_mut(|li| li.sequence_number = 104);
    let r2 = env.as_contract(&contract_id, || {
        rate_limit::check_rate_limit(&env, &user, "raise_dispute")
    });
    assert!(r2.is_err());

    // Advance to block 105 (exactly 5 blocks later - should fail, need > 5)
    env.ledger().with_mut(|li| li.sequence_number = 105);
    let r3 = env.as_contract(&contract_id, || {
        rate_limit::check_rate_limit(&env, &user, "raise_dispute")
    });
    assert!(r3.is_err());

    // Advance to block 106 (6 blocks later - cooldown passed)
    env.ledger().with_mut(|li| li.sequence_number = 106);
    let r4 = env.as_contract(&contract_id, || {
        rate_limit::check_rate_limit(&env, &user, "raise_dispute")
    });
    assert!(r4.is_ok());
}

#[test]
fn test_rate_limit_block_limit_resets_per_block() {
    let (env, contract_id, _user) = setup();

    seed_config(
        &env,
        &contract_id,
        &RateLimitConfig {
            max_calls_per_block: 3,
            max_calls_per_user_per_day: 100,
            cooldown_blocks: 0,
        },
    );

    env.ledger().with_mut(|li| li.sequence_number = 50);

    let user1 = Address::generate(&env);
    let user2 = Address::generate(&env);
    let user3 = Address::generate(&env);
    let user4 = Address::generate(&env);

    // Block 50: 3 calls should work
    for user in [&user1, &user2, &user3] {
        let result = env.as_contract(&contract_id, || {
            rate_limit::check_rate_limit(&env, user, "raise_dispute")
        });
        assert!(result.is_ok());
    }

    // 4th call in same block should fail
    let result = env.as_contract(&contract_id, || {
        rate_limit::check_rate_limit(&env, &user4, "raise_dispute")
    });
    assert!(result.is_err());

    // Move to next block 51
    env.ledger().with_mut(|li| li.sequence_number = 51);

    // Block limit should reset - all 3 calls should work again
    for user in [&user1, &user2, &user3] {
        let result = env.as_contract(&contract_id, || {
            rate_limit::check_rate_limit(&env, user, "raise_dispute")
        });
        assert!(result.is_ok());
    }

    // 4th call should fail again
    let result = env.as_contract(&contract_id, || {
        rate_limit::check_rate_limit(&env, &user4, "raise_dispute")
    });
    assert!(result.is_err());
}
