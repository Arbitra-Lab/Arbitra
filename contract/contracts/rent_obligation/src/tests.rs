use super::*;
use soroban_sdk::{
    testutils::{Address as _, Events, Ledger, MockAuth, MockAuthInvoke},
    Address, Env, IntoVal, String,
};

fn create_contract(env: &Env) -> TokenizedRentObligationContractClient<'_> {
    let contract_id = env.register(TokenizedRentObligationContract, ());
    TokenizedRentObligationContractClient::new(env, &contract_id)
}

const SECS_PER_DAY: u64 = 86400;

fn make_tiers(env: &Env, pairs: &[(u32, i128)]) -> Vec<LateFeeTier> {
    let mut tiers: Vec<LateFeeTier> = Vec::new(env);
    for (min_days_overdue, fee_amount) in pairs {
        tiers.push_back(LateFeeTier {
            min_days_overdue: *min_days_overdue,
            fee_amount: *fee_amount,
        });
    }
    tiers
}

/// Sets up an obligation with a rent schedule due at `due_date = 1000`,
/// a 3-day grace period, and a 3-tier progressive schedule capped at 300.
fn setup_schedule(
    env: &Env,
    client: &TokenizedRentObligationContractClient<'_>,
    agreement_id: &String,
    landlord: &Address,
) {
    client.mint_obligation(agreement_id, landlord);

    let tiers = make_tiers(
        env,
        &[
            (0, 50),   // tier 1: 0-2 days over grace
            (3, 150),  // tier 2: 3-6 days over grace
            (7, 1000), // tier 3: 7+ days over grace (would exceed cap)
        ],
    );

    client.configure_rent_schedule(
        landlord,
        agreement_id,
        &1000i128,           // rent_amount
        &1000u64,            // due_date
        &2_592_000u64,       // period_secs (30 days)
        &(3 * SECS_PER_DAY), // grace_period_secs
        &tiers,
        &300i128, // max_late_fee
    );
}

#[test]
fn test_late_fee_zero_within_grace() {
    let env = Env::default();
    env.mock_all_auths();

    let client = create_contract(&env);
    client.initialize();

    let landlord = Address::generate(&env);
    let agreement_id = String::from_str(&env, "agreement_001");
    setup_schedule(&env, &client, &agreement_id, &landlord);

    // Still exactly at the due date: no fee.
    env.ledger().with_mut(|li| {
        li.timestamp = 1000;
    });
    let fee = client.record_payment(&agreement_id);
    assert_eq!(fee, 0);
    let state = client.get_late_fee_state(&agreement_id).unwrap();
    assert_eq!(state.total_late_fees, 0);
    assert_eq!(state.last_tier, 0);

    // Exactly at the end of the grace window: still no fee.
    env.ledger().with_mut(|li| {
        li.timestamp = 1000 + 3 * SECS_PER_DAY;
    });
    let fee = client.record_payment(&agreement_id);
    assert_eq!(fee, 0);

    let all_events = env.events().all();
    assert!(all_events.is_empty());
}

#[test]
fn test_late_fee_tiered_progression() {
    let env = Env::default();
    env.mock_all_auths();

    let client = create_contract(&env);
    client.initialize();

    let landlord = Address::generate(&env);
    let agreement_id = String::from_str(&env, "agreement_001");
    setup_schedule(&env, &client, &agreement_id, &landlord);

    // 1 day over grace -> tier 1 (fee 50).
    env.ledger().with_mut(|li| {
        li.timestamp = 1000 + 3 * SECS_PER_DAY + SECS_PER_DAY;
    });
    let fee = client.record_payment(&agreement_id);
    assert_eq!(fee, 50);
    assert_eq!(env.events().all().len(), 1);
    let state = client.get_late_fee_state(&agreement_id).unwrap();
    assert_eq!(state.last_tier, 1);
    assert_eq!(state.total_late_fees, 50);

    // 4 days over grace -> tier 2 (fee 150).
    env.ledger().with_mut(|li| {
        li.timestamp = 1000 + 3 * SECS_PER_DAY + 4 * SECS_PER_DAY;
    });
    let fee = client.record_payment(&agreement_id);
    assert_eq!(fee, 150);
    assert_eq!(env.events().all().len(), 1);
    let state = client.get_late_fee_state(&agreement_id).unwrap();
    assert_eq!(state.last_tier, 2);
    assert_eq!(state.total_late_fees, 150);
}

#[test]
fn test_late_fee_capped() {
    let env = Env::default();
    env.mock_all_auths();

    let client = create_contract(&env);
    client.initialize();

    let landlord = Address::generate(&env);
    let agreement_id = String::from_str(&env, "agreement_001");
    setup_schedule(&env, &client, &agreement_id, &landlord);

    // 8 days over grace -> tier 3, raw fee 1000, capped at 300.
    env.ledger().with_mut(|li| {
        li.timestamp = 1000 + 3 * SECS_PER_DAY + 8 * SECS_PER_DAY;
    });
    let fee = client.record_payment(&agreement_id);
    assert_eq!(fee, 300);
    let state = client.get_late_fee_state(&agreement_id).unwrap();
    assert_eq!(state.last_tier, 3);
    assert_eq!(state.total_late_fees, 300);
}

#[test]
fn test_settle_obligation_resets_state() {
    let env = Env::default();
    env.mock_all_auths();

    let client = create_contract(&env);
    client.initialize();

    let landlord = Address::generate(&env);
    let agreement_id = String::from_str(&env, "agreement_001");
    setup_schedule(&env, &client, &agreement_id, &landlord);

    env.ledger().with_mut(|li| {
        li.timestamp = 1000 + 3 * SECS_PER_DAY + 8 * SECS_PER_DAY;
    });
    let fee = client.record_payment(&agreement_id);
    assert_eq!(fee, 300);

    client.settle_obligation(&agreement_id);

    let state = client.get_late_fee_state(&agreement_id).unwrap();
    assert_eq!(state.total_late_fees, 0);
    assert_eq!(state.last_tier, 0);

    let schedule = client.get_rent_schedule(&agreement_id).unwrap();
    assert_eq!(schedule.due_date, 1000 + 2_592_000);

    // A payment made right at the new due date is on-time again.
    env.ledger().with_mut(|li| {
        li.timestamp = schedule.due_date;
    });
    let fee = client.record_payment(&agreement_id);
    assert_eq!(fee, 0);
}

#[test]
#[should_panic(expected = "Error(Contract, #11)")]
fn test_configure_rent_schedule_rejects_non_zero_first_tier() {
    let env = Env::default();
    env.mock_all_auths();

    let client = create_contract(&env);
    client.initialize();

    let landlord = Address::generate(&env);
    let agreement_id = String::from_str(&env, "agreement_001");
    client.mint_obligation(&agreement_id, &landlord);

    let tiers = make_tiers(&env, &[(1, 50)]);

    client.configure_rent_schedule(
        &landlord,
        &agreement_id,
        &1000i128,
        &1000u64,
        &2_592_000u64,
        &(3 * SECS_PER_DAY),
        &tiers,
        &300i128,
    );
}

#[test]
#[should_panic(expected = "Error(Contract, #5)")]
fn test_configure_rent_schedule_requires_owner() {
    let env = Env::default();
    env.mock_all_auths();

    let client = create_contract(&env);
    client.initialize();

    let landlord = Address::generate(&env);
    let stranger = Address::generate(&env);
    let agreement_id = String::from_str(&env, "agreement_001");
    client.mint_obligation(&agreement_id, &landlord);

    let tiers = make_tiers(&env, &[(0, 50)]);

    client.configure_rent_schedule(
        &stranger,
        &agreement_id,
        &1000i128,
        &1000u64,
        &2_592_000u64,
        &(3 * SECS_PER_DAY),
        &tiers,
        &300i128,
    );
}

#[test]
#[should_panic(expected = "Error(Contract, #12)")]
fn test_record_payment_without_schedule_fails() {
    let env = Env::default();
    env.mock_all_auths();

    let client = create_contract(&env);
    client.initialize();

    let landlord = Address::generate(&env);
    let agreement_id = String::from_str(&env, "agreement_001");
    client.mint_obligation(&agreement_id, &landlord);

    client.record_payment(&agreement_id);
}

#[test]
fn test_successful_initialization() {
    let env = Env::default();
    let client = create_contract(&env);

    let result = client.try_initialize();
    assert!(result.is_ok());

    let count = client.get_obligation_count();
    assert_eq!(count, 0);
}

#[test]
#[should_panic(expected = "Error(Contract, #1)")]
fn test_double_initialization_fails() {
    let env = Env::default();
    let client = create_contract(&env);

    client.initialize();
    client.initialize();
}

#[test]
fn test_mint_obligation() {
    let env = Env::default();
    env.mock_all_auths();

    let client = create_contract(&env);
    client.initialize();

    let landlord = Address::generate(&env);
    let agreement_id = String::from_str(&env, "agreement_001");

    let result = client.try_mint_obligation(&agreement_id, &landlord);
    assert!(result.is_ok());

    let owner = client.get_obligation_owner(&agreement_id);
    assert_eq!(owner, Some(landlord.clone()));

    let has_obligation = client.has_obligation(&agreement_id);
    assert!(has_obligation);

    let count = client.get_obligation_count();
    assert_eq!(count, 1);

    let obligation = client.get_obligation(&agreement_id);
    assert!(obligation.is_some());
    let obligation = obligation.unwrap();
    assert_eq!(obligation.agreement_id, agreement_id);
    assert_eq!(obligation.owner, landlord);
    assert_eq!(obligation.minted_at, env.ledger().timestamp());
}

#[test]
#[should_panic]
fn test_mint_obligation_requires_auth() {
    let env = Env::default();

    let client = create_contract(&env);
    client.initialize();

    let landlord = Address::generate(&env);
    let agreement_id = String::from_str(&env, "agreement_001");

    client.mint_obligation(&agreement_id, &landlord);
}

#[test]
#[should_panic(expected = "Error(Contract, #3)")]
fn test_mint_duplicate_obligation_fails() {
    let env = Env::default();
    env.mock_all_auths();

    let client = create_contract(&env);
    client.initialize();

    let landlord = Address::generate(&env);
    let agreement_id = String::from_str(&env, "agreement_001");

    client.mint_obligation(&agreement_id, &landlord);
    client.mint_obligation(&agreement_id, &landlord);
}

#[test]
#[should_panic(expected = "Error(Contract, #2)")]
fn test_mint_without_initialization_fails() {
    let env = Env::default();
    env.mock_all_auths();

    let client = create_contract(&env);

    let landlord = Address::generate(&env);
    let agreement_id = String::from_str(&env, "agreement_001");

    client.mint_obligation(&agreement_id, &landlord);
}

#[test]
fn test_transfer_obligation() {
    let env = Env::default();
    env.mock_all_auths();

    let client = create_contract(&env);
    client.initialize();

    let landlord = Address::generate(&env);
    let new_owner = Address::generate(&env);
    let agreement_id = String::from_str(&env, "agreement_001");

    client.mint_obligation(&agreement_id, &landlord);

    let result = client.try_transfer_obligation(&landlord, &new_owner, &agreement_id);
    assert!(result.is_ok());

    let owner = client.get_obligation_owner(&agreement_id);
    assert_eq!(owner, Some(new_owner.clone()));

    let obligation = client.get_obligation(&agreement_id);
    assert!(obligation.is_some());
    let obligation = obligation.unwrap();
    assert_eq!(obligation.owner, new_owner);
}

#[test]
#[should_panic]
fn test_transfer_obligation_requires_auth() {
    let env = Env::default();

    let client = create_contract(&env);
    client.initialize();

    let landlord = Address::generate(&env);
    let new_owner = Address::generate(&env);
    let agreement_id = String::from_str(&env, "agreement_001");

    client
        .mock_auths(&[MockAuth {
            address: &landlord,
            invoke: &MockAuthInvoke {
                contract: &client.address,
                fn_name: "mint_obligation",
                args: (&agreement_id, &landlord).into_val(&env),
                sub_invokes: &[],
            },
        }])
        .mint_obligation(&agreement_id, &landlord);

    client.transfer_obligation(&landlord, &new_owner, &agreement_id);
}

#[test]
#[should_panic(expected = "Error(Contract, #4)")]
fn test_transfer_nonexistent_obligation_fails() {
    let env = Env::default();
    env.mock_all_auths();

    let client = create_contract(&env);
    client.initialize();

    let landlord = Address::generate(&env);
    let new_owner = Address::generate(&env);
    let agreement_id = String::from_str(&env, "nonexistent");

    client.transfer_obligation(&landlord, &new_owner, &agreement_id);
}

#[test]
#[should_panic(expected = "Error(Contract, #5)")]
fn test_transfer_from_non_owner_fails() {
    let env = Env::default();
    env.mock_all_auths();

    let client = create_contract(&env);
    client.initialize();

    let landlord = Address::generate(&env);
    let fake_owner = Address::generate(&env);
    let new_owner = Address::generate(&env);
    let agreement_id = String::from_str(&env, "agreement_001");

    client.mint_obligation(&agreement_id, &landlord);

    client.transfer_obligation(&fake_owner, &new_owner, &agreement_id);
}

#[test]
fn test_multiple_obligations() {
    let env = Env::default();
    env.mock_all_auths();

    let client = create_contract(&env);
    client.initialize();

    let landlord1 = Address::generate(&env);
    let landlord2 = Address::generate(&env);
    let landlord3 = Address::generate(&env);

    let agreement_id1 = String::from_str(&env, "agreement_001");
    let agreement_id2 = String::from_str(&env, "agreement_002");
    let agreement_id3 = String::from_str(&env, "agreement_003");

    client.mint_obligation(&agreement_id1, &landlord1);
    client.mint_obligation(&agreement_id2, &landlord2);
    client.mint_obligation(&agreement_id3, &landlord3);

    assert_eq!(client.get_obligation_count(), 3);

    assert_eq!(client.get_obligation_owner(&agreement_id1), Some(landlord1));
    assert_eq!(client.get_obligation_owner(&agreement_id2), Some(landlord2));
    assert_eq!(client.get_obligation_owner(&agreement_id3), Some(landlord3));
}

#[test]
fn test_get_nonexistent_obligation() {
    let env = Env::default();
    let client = create_contract(&env);
    client.initialize();

    let agreement_id = String::from_str(&env, "nonexistent");

    let owner = client.get_obligation_owner(&agreement_id);
    assert_eq!(owner, None);

    let obligation = client.get_obligation(&agreement_id);
    assert_eq!(obligation, None);

    let has_obligation = client.has_obligation(&agreement_id);
    assert!(!has_obligation);
}

#[test]
fn test_transfer_chain() {
    let env = Env::default();
    env.mock_all_auths();

    let client = create_contract(&env);
    client.initialize();

    let landlord = Address::generate(&env);
    let buyer1 = Address::generate(&env);
    let buyer2 = Address::generate(&env);
    let buyer3 = Address::generate(&env);
    let agreement_id = String::from_str(&env, "agreement_001");

    client.mint_obligation(&agreement_id, &landlord);
    assert_eq!(
        client.get_obligation_owner(&agreement_id),
        Some(landlord.clone())
    );

    client.transfer_obligation(&landlord, &buyer1, &agreement_id);
    assert_eq!(
        client.get_obligation_owner(&agreement_id),
        Some(buyer1.clone())
    );

    client.transfer_obligation(&buyer1, &buyer2, &agreement_id);
    assert_eq!(
        client.get_obligation_owner(&agreement_id),
        Some(buyer2.clone())
    );

    client.transfer_obligation(&buyer2, &buyer3, &agreement_id);
    assert_eq!(
        client.get_obligation_owner(&agreement_id),
        Some(buyer3.clone())
    );

    assert_eq!(client.get_obligation_count(), 1);
}

#[test]
fn test_events_emitted() {
    let env = Env::default();
    env.mock_all_auths();

    let client = create_contract(&env);
    client.initialize();

    let landlord = Address::generate(&env);
    let new_owner = Address::generate(&env);
    let agreement_id = String::from_str(&env, "agreement_001");

    client.mint_obligation(&agreement_id, &landlord);
    client.transfer_obligation(&landlord, &new_owner, &agreement_id);

    let all_events = env.events().all();
    assert!(!all_events.is_empty());
}

#[test]
fn test_nft_burn_by_owner() {
    let env = Env::default();
    env.mock_all_auths();

    let client = create_contract(&env);
    client.initialize();

    let landlord = Address::generate(&env);
    let agreement_id = String::from_str(&env, "agreement_001");

    client.mint_obligation(&agreement_id, &landlord);

    env.ledger().with_mut(|li| {
        li.timestamp = li.timestamp.saturating_add(1);
    });

    client.burn_nft(&agreement_id, &String::from_str(&env, "LeaseCompleted"));

    let record = client.get_burn_record(&agreement_id);
    assert_eq!(record.token_id, agreement_id);
    assert_eq!(record.burned_by, landlord);
    assert_eq!(record.reason, String::from_str(&env, "LeaseCompleted"));
}

#[test]
#[should_panic(expected = "Error(Contract, #7)")]
fn test_nft_burn_already_burned_fails() {
    let env = Env::default();
    env.mock_all_auths();

    let client = create_contract(&env);
    client.initialize();

    let landlord = Address::generate(&env);
    let agreement_id = String::from_str(&env, "agreement_001");

    client.mint_obligation(&agreement_id, &landlord);

    env.ledger().with_mut(|li| {
        li.timestamp = li.timestamp.saturating_add(1);
    });

    client.burn_nft(&agreement_id, &String::from_str(&env, "LeaseCompleted"));
    client.burn_nft(&agreement_id, &String::from_str(&env, "LeaseCompleted"));
}

#[test]
#[should_panic(expected = "Error(Contract, #8)")]
fn test_nft_burn_record_not_found() {
    let env = Env::default();

    let client = create_contract(&env);
    client.initialize();

    let agreement_id = String::from_str(&env, "nonexistent");

    client.get_burn_record(&agreement_id);
}

#[test]
#[should_panic(expected = "Error(Contract, #4)")]
fn test_nft_burn_nonexistent_fails() {
    let env = Env::default();
    env.mock_all_auths();

    let client = create_contract(&env);
    client.initialize();

    let agreement_id = String::from_str(&env, "nonexistent");

    client.burn_nft(&agreement_id, &String::from_str(&env, "UserRequested"));
}

#[test]
#[should_panic]
fn test_nft_burn_requires_auth() {
    let env = Env::default();

    let client = create_contract(&env);
    client.initialize();

    let landlord = Address::generate(&env);
    let agreement_id = String::from_str(&env, "agreement_001");

    client
        .mock_auths(&[MockAuth {
            address: &landlord,
            invoke: &MockAuthInvoke {
                contract: &client.address,
                fn_name: "mint_obligation",
                args: (&agreement_id, &landlord).into_val(&env),
                sub_invokes: &[],
            },
        }])
        .mint_obligation(&agreement_id, &landlord);

    env.ledger().with_mut(|li| {
        li.timestamp = li.timestamp.saturating_add(1);
    });

    client.burn_nft(&agreement_id, &String::from_str(&env, "LeaseCompleted"));
}

#[test]
fn test_nft_burn_can_burn_after_lease_end() {
    let env = Env::default();
    env.mock_all_auths();

    let client = create_contract(&env);
    client.initialize();

    let landlord = Address::generate(&env);
    let agreement_id = String::from_str(&env, "agreement_001");

    client.mint_obligation(&agreement_id, &landlord);

    env.ledger().with_mut(|li| {
        li.timestamp = li.timestamp.saturating_add(1);
    });

    let can_burn_result = client.can_burn(&agreement_id);
    assert!(can_burn_result);
}

#[test]
#[should_panic(expected = "Error(Contract, #4)")]
fn test_nft_burn_can_burn_nonexistent_fails() {
    let env = Env::default();

    let client = create_contract(&env);
    client.initialize();

    let agreement_id = String::from_str(&env, "nonexistent");

    client.can_burn(&agreement_id);
}

#[test]
#[should_panic(expected = "Error(Contract, #7)")]
fn test_nft_burn_can_burn_already_burned_fails() {
    let env = Env::default();
    env.mock_all_auths();

    let client = create_contract(&env);
    client.initialize();

    let landlord = Address::generate(&env);
    let agreement_id = String::from_str(&env, "agreement_001");

    client.mint_obligation(&agreement_id, &landlord);

    env.ledger().with_mut(|li| {
        li.timestamp = li.timestamp.saturating_add(1);
    });

    client.burn_nft(&agreement_id, &String::from_str(&env, "LeaseCompleted"));
    client.can_burn(&agreement_id);
}

#[test]
fn test_nft_burn_with_allowed_reasons() {
    let env = Env::default();
    env.mock_all_auths();

    let client = create_contract(&env);
    client.initialize();

    let landlord = Address::generate(&env);

    let agreement_id1 = String::from_str(&env, "agreement_001");
    client.mint_obligation(&agreement_id1, &landlord);
    env.ledger().with_mut(|li| {
        li.timestamp = li.timestamp.saturating_add(1);
    });
    client.burn_nft(&agreement_id1, &String::from_str(&env, "LeaseCompleted"));
    assert_eq!(
        client.get_burn_record(&agreement_id1).reason,
        String::from_str(&env, "LeaseCompleted")
    );

    let agreement_id2 = String::from_str(&env, "agreement_002");
    client.mint_obligation(&agreement_id2, &landlord);
    env.ledger().with_mut(|li| {
        li.timestamp = li.timestamp.saturating_add(1);
    });
    client.burn_nft(
        &agreement_id2,
        &String::from_str(&env, "AgreementTerminated"),
    );
    assert_eq!(
        client.get_burn_record(&agreement_id2).reason,
        String::from_str(&env, "AgreementTerminated")
    );

    let agreement_id3 = String::from_str(&env, "agreement_003");
    client.mint_obligation(&agreement_id3, &landlord);
    env.ledger().with_mut(|li| {
        li.timestamp = li.timestamp.saturating_add(1);
    });
    client.burn_nft(&agreement_id3, &String::from_str(&env, "DisputeResolved"));
    assert_eq!(
        client.get_burn_record(&agreement_id3).reason,
        String::from_str(&env, "DisputeResolved")
    );

    let agreement_id4 = String::from_str(&env, "agreement_004");
    client.mint_obligation(&agreement_id4, &landlord);
    env.ledger().with_mut(|li| {
        li.timestamp = li.timestamp.saturating_add(1);
    });
    client.burn_nft(&agreement_id4, &String::from_str(&env, "UserRequested"));
    assert_eq!(
        client.get_burn_record(&agreement_id4).reason,
        String::from_str(&env, "UserRequested")
    );
}

#[test]
fn test_nft_burn_events_emitted() {
    let env = Env::default();
    env.mock_all_auths();

    let client = create_contract(&env);
    client.initialize();

    let landlord = Address::generate(&env);
    let agreement_id = String::from_str(&env, "agreement_001");

    client.mint_obligation(&agreement_id, &landlord);
    env.ledger().with_mut(|li| {
        li.timestamp = li.timestamp.saturating_add(1);
    });
    client.burn_nft(&agreement_id, &String::from_str(&env, "LeaseCompleted"));

    let all_events = env.events().all();
    assert!(!all_events.is_empty());
}

#[test]
fn test_nft_burn_history_tracking() {
    let env = Env::default();
    env.mock_all_auths();

    let client = create_contract(&env);
    client.initialize();

    let landlord = Address::generate(&env);
    let agreement_id = String::from_str(&env, "agreement_001");

    client.mint_obligation(&agreement_id, &landlord);
    env.ledger().with_mut(|li| {
        li.timestamp = li.timestamp.saturating_add(1);
    });
    client.burn_nft(&agreement_id, &String::from_str(&env, "UserRequested"));

    let burned = client.get_burned_nfts(&landlord);
    assert_eq!(burned.len(), 1);
    assert_eq!(burned.get(0).unwrap(), agreement_id);
}

#[test]
#[should_panic(expected = "Error(Contract, #9)")]
fn test_nft_burn_cannot_burn_active_obligation() {
    let env = Env::default();
    env.mock_all_auths();

    let client = create_contract(&env);
    client.initialize();

    let landlord = Address::generate(&env);
    let agreement_id = String::from_str(&env, "agreement_001");

    client.mint_obligation(&agreement_id, &landlord);
    client.burn_nft(&agreement_id, &String::from_str(&env, "LeaseCompleted"));
}

#[test]
#[should_panic(expected = "Error(Contract, #10)")]
fn test_nft_burn_invalid_reason_fails() {
    let env = Env::default();
    env.mock_all_auths();

    let client = create_contract(&env);
    client.initialize();

    let landlord = Address::generate(&env);
    let agreement_id = String::from_str(&env, "agreement_001");

    client.mint_obligation(&agreement_id, &landlord);
    env.ledger().with_mut(|li| {
        li.timestamp = li.timestamp.saturating_add(1);
    });
    client.burn_nft(&agreement_id, &String::from_str(&env, "InvalidReason"));
}

#[test]
fn test_burn_after_transfer_tracks_new_owner() {
    let env = Env::default();
    env.mock_all_auths();

    let client = create_contract(&env);
    client.initialize();

    let landlord = Address::generate(&env);
    let new_owner = Address::generate(&env);
    let agreement_id = String::from_str(&env, "agreement_transfer_burn");

    client.mint_obligation(&agreement_id, &landlord);
    client.transfer_obligation(&landlord, &new_owner, &agreement_id);

    env.ledger().with_mut(|li| {
        li.timestamp = li.timestamp.saturating_add(1);
    });

    client.burn_nft(&agreement_id, &String::from_str(&env, "UserRequested"));

    let record = client.get_burn_record(&agreement_id);
    assert_eq!(record.burned_by, new_owner.clone());
    let burned = client.get_burned_nfts(&new_owner);
    assert_eq!(burned.get(0).unwrap(), agreement_id.clone());
}

#[test]
fn test_get_burned_nfts_returns_multiple_records_for_owner() {
    let env = Env::default();
    env.mock_all_auths();

    let client = create_contract(&env);
    client.initialize();

    let landlord = Address::generate(&env);
    let agreement_one = String::from_str(&env, "agreement_burned_001");
    let agreement_two = String::from_str(&env, "agreement_burned_002");

    client.mint_obligation(&agreement_one, &landlord);
    env.ledger().with_mut(|li| {
        li.timestamp = li.timestamp.saturating_add(1);
    });
    client.burn_nft(&agreement_one, &String::from_str(&env, "LeaseCompleted"));

    client.mint_obligation(&agreement_two, &landlord);
    env.ledger().with_mut(|li| {
        li.timestamp = li.timestamp.saturating_add(1);
    });
    client.burn_nft(
        &agreement_two,
        &String::from_str(&env, "AgreementTerminated"),
    );

    let burned = client.get_burned_nfts(&landlord);
    assert_eq!(burned.len(), 2);
    assert_eq!(burned.get(0).unwrap(), agreement_one);
    assert_eq!(burned.get(1).unwrap(), agreement_two);
}
