//! Tests for the tiered platform fee engine: tier resolution, schedule
//! validation, discount stacking, rounding remainders, and fee conservation
//! across the payment paths that route through it.

use crate::late_fee::{quote_fee_with_schedule, resolve_tier, validate_fee_schedule};
use crate::storage::DataKey;
use crate::types::*;
use crate::PaymentContract;
use soroban_sdk::{testutils::Address as _, testutils::Ledger, Address, Env, Map, String, Vec};

fn tiers(env: &Env, pairs: &[(i128, u32)]) -> FeeSchedule {
    let mut tiers: Vec<FeeTier> = Vec::new(env);
    for (threshold, bps) in pairs {
        tiers.push_back(FeeTier {
            threshold: *threshold,
            bps: *bps,
        });
    }
    FeeSchedule { tiers }
}

fn create_test_agreement(
    env: &Env,
    id: &str,
    tenant: &Address,
    landlord: &Address,
    monthly_rent: i128,
    payment_token: Address,
) -> RentAgreement {
    RentAgreement {
        agreement_id: String::from_str(env, id),
        tenant: tenant.clone(),
        landlord: landlord.clone(),
        agent: None,
        monthly_rent,
        agent_commission_rate: 0,
        status: AgreementStatus::Active,
        total_rent_paid: 0,
        payment_count: 0,
        security_deposit: 0,
        start_date: 0,
        end_date: 0,
        signed_at: None,
        payment_token,
        next_payment_due: 0,
        payment_history: Map::new(env),
    }
}

fn create_token(env: &Env, admin: &Address) -> Address {
    env.register_stellar_asset_contract_v2(admin.clone())
        .address()
}

fn create_payment_contract(env: &Env) -> crate::PaymentContractClient<'_> {
    let contract_id = env.register(PaymentContract, ());
    crate::PaymentContractClient::new(env, &contract_id)
}

fn seed_agreement(
    env: &Env,
    client: &crate::PaymentContractClient<'_>,
    agreement_key: &str,
    agreement: &RentAgreement,
) {
    let key = DataKey::Agreement(String::from_str(env, agreement_key));
    env.as_contract(&client.address, || {
        env.storage().persistent().set(&key, agreement);
    });
}

// ─── Unit tests: tier resolution ───────────────────────────────────────────

#[test]
fn test_resolve_tier_boundaries() {
    let env = Env::default();
    let schedule = tiers(&env, &[(0, 200), (1_000, 100), (10_000, 25)]);

    assert_eq!(resolve_tier(&schedule, 0).unwrap(), (0, 200));
    assert_eq!(resolve_tier(&schedule, 999).unwrap(), (0, 200));
    assert_eq!(resolve_tier(&schedule, 1_000).unwrap(), (1, 100));
    assert_eq!(resolve_tier(&schedule, 9_999).unwrap(), (1, 100));
    assert_eq!(resolve_tier(&schedule, 10_000).unwrap(), (2, 25));
    assert_eq!(resolve_tier(&schedule, 1_000_000).unwrap(), (2, 25));
}

#[test]
fn test_resolve_tier_rejects_negative_amount() {
    let env = Env::default();
    let schedule = tiers(&env, &[(0, 100)]);
    assert!(resolve_tier(&schedule, -1).is_err());
}

// ─── Unit tests: schedule validation ───────────────────────────────────────

#[test]
fn test_validate_fee_schedule_accepts_well_formed_schedule() {
    let env = Env::default();
    let schedule = tiers(&env, &[(0, 200), (1_000, 100), (10_000, 25)]);
    assert!(validate_fee_schedule(&schedule).is_ok());
}

#[test]
fn test_validate_fee_schedule_rejects_empty() {
    let env = Env::default();
    let schedule = FeeSchedule {
        tiers: Vec::new(&env),
    };
    assert!(validate_fee_schedule(&schedule).is_err());
}

#[test]
fn test_validate_fee_schedule_rejects_nonzero_first_threshold() {
    let env = Env::default();
    let schedule = tiers(&env, &[(1, 100)]);
    assert!(validate_fee_schedule(&schedule).is_err());
}

#[test]
fn test_validate_fee_schedule_rejects_non_increasing_thresholds() {
    let env = Env::default();
    // Second and third tier share the same threshold: not strictly increasing.
    let schedule = tiers(&env, &[(0, 100), (500, 50), (500, 25)]);
    assert!(validate_fee_schedule(&schedule).is_err());
}

#[test]
fn test_validate_fee_schedule_rejects_overlapping_out_of_order_thresholds() {
    let env = Env::default();
    let schedule = tiers(&env, &[(0, 100), (1_000, 50), (900, 25)]);
    assert!(validate_fee_schedule(&schedule).is_err());
}

#[test]
fn test_validate_fee_schedule_rejects_bps_over_100_percent() {
    let env = Env::default();
    let schedule = tiers(&env, &[(0, 10_001)]);
    assert!(validate_fee_schedule(&schedule).is_err());
}

// ─── Unit tests: discount stacking ─────────────────────────────────────────

#[test]
fn test_quote_fee_discount_stacks_on_tier_rate() {
    let env = Env::default();
    let schedule = tiers(&env, &[(0, 100)]); // 1%
    let quote = quote_fee_with_schedule(&schedule, 30, 100_000).unwrap(); // 0.3% discount
    assert_eq!(quote.tier_index, 0);
    assert_eq!(quote.fee, 700); // effective 70 bps
    assert_eq!(quote.discount, 300); // undiscounted 1000 - discounted 700
    assert_eq!(quote.net, 99_300);
    assert_eq!(quote.fee + quote.net, quote.gross);
}

#[test]
fn test_quote_fee_discount_floors_at_zero_never_goes_negative() {
    let env = Env::default();
    let schedule = tiers(&env, &[(0, 100)]);
    let quote = quote_fee_with_schedule(&schedule, 10_000, 100_000).unwrap();
    assert_eq!(quote.fee, 0);
    assert_eq!(quote.net, 100_000);
    assert_eq!(quote.discount, 1_000);
}

#[test]
fn test_quote_fee_zero_discount_matches_undiscounted_tier_rate() {
    let env = Env::default();
    let schedule = tiers(&env, &[(0, 250)]);
    let quote = quote_fee_with_schedule(&schedule, 0, 40_000).unwrap();
    assert_eq!(quote.discount, 0);
    assert_eq!(quote.fee, 1_000);
    assert_eq!(quote.net, 39_000);
}

// ─── Unit tests: rounding remainders at min/max amounts ───────────────────

#[test]
fn test_quote_fee_rounds_half_to_even_down() {
    let env = Env::default();
    let schedule = tiers(&env, &[(0, 50)]); // 0.5%
    // 100 * 50 / 10_000 = 0.5 exactly -> ties to even quotient (0)
    let quote = quote_fee_with_schedule(&schedule, 0, 100).unwrap();
    assert_eq!(quote.fee, 0);
    assert_eq!(quote.net, 100);
}

#[test]
fn test_quote_fee_rounds_half_to_even_up() {
    let env = Env::default();
    let schedule = tiers(&env, &[(0, 50)]); // 0.5%
    // 300 * 50 / 10_000 = 1.5 exactly -> ties to even quotient (2)
    let quote = quote_fee_with_schedule(&schedule, 0, 300).unwrap();
    assert_eq!(quote.fee, 2);
    assert_eq!(quote.net, 298);
}

#[test]
fn test_quote_fee_min_amount_conserves_gross_with_no_leakage() {
    let env = Env::default();
    // A near-100% rate on the smallest possible positive amount is the
    // sharpest test of the rounding/remainder policy.
    let schedule = tiers(&env, &[(0, 9_999)]);
    let quote = quote_fee_with_schedule(&schedule, 0, 1).unwrap();
    assert_eq!(quote.fee + quote.net, quote.gross);
}

#[test]
fn test_quote_fee_max_amount_conserves_gross_with_no_leakage() {
    let env = Env::default();
    let schedule = tiers(&env, &[(0, 3_333)]); // an awkward, non-round rate
    let max_amount: i128 = 1_000_000_000_000_000_000; // 1e18, far below i128::MAX
    let quote = quote_fee_with_schedule(&schedule, 0, max_amount).unwrap();
    assert_eq!(quote.fee + quote.net, quote.gross);
    assert_eq!(quote.gross, max_amount);
}

#[test]
fn test_quote_fee_is_deterministic_for_identical_inputs() {
    let env = Env::default();
    let schedule = tiers(&env, &[(0, 200), (5_000, 75)]);
    let a = quote_fee_with_schedule(&schedule, 20, 12_345).unwrap();
    let b = quote_fee_with_schedule(&schedule, 20, 12_345).unwrap();
    assert_eq!(a, b);
}

// ─── Contract-level tests: configuration & routing ─────────────────────────

#[test]
fn test_set_fee_schedule_rejects_invalid_schedule() {
    let env = Env::default();
    env.mock_all_auths();
    let client = create_payment_contract(&env);
    let admin = Address::generate(&env);

    // Not strictly increasing: third tier's threshold goes backwards.
    let bad_schedule = tiers(&env, &[(0, 100), (500, 50), (400, 10)]);
    let result = client.try_set_fee_schedule(&admin, &bad_schedule);
    assert!(result.is_err());
}

#[test]
fn test_set_fee_schedule_requires_platform_collector_once_configured() {
    let env = Env::default();
    env.mock_all_auths();
    let client = create_payment_contract(&env);
    let collector = Address::generate(&env);
    let other = Address::generate(&env);

    client.set_platform_fee_collector(&collector);

    let schedule = tiers(&env, &[(0, 100)]);
    let result = client.try_set_fee_schedule(&other, &schedule);
    assert!(result.is_err());

    client.set_fee_schedule(&collector, &schedule);
    assert_eq!(client.get_fee_schedule(), schedule);
}

#[test]
fn test_quote_fee_contract_view_matches_pure_computation() {
    let env = Env::default();
    env.mock_all_auths();
    let client = create_payment_contract(&env);
    let admin = Address::generate(&env);
    let payer = Address::generate(&env);

    let schedule = tiers(&env, &[(0, 300), (1_000, 150)]);
    client.set_fee_schedule(&admin, &schedule);
    client.set_payer_discount(&admin, &payer, &50);

    let quote = client.quote_fee(&2_000, &payer);
    let expected = quote_fee_with_schedule(&schedule, 50, 2_000).unwrap();
    assert_eq!(quote, expected);
}

#[test]
fn test_pay_rent_routes_through_fee_engine() {
    let env = Env::default();
    env.mock_all_auths();

    let client = create_payment_contract(&env);
    let tenant = Address::generate(&env);
    let landlord = Address::generate(&env);
    let platform = Address::generate(&env);
    let token_admin = Address::generate(&env);
    let token = create_token(&env, &token_admin);

    soroban_sdk::token::StellarAssetClient::new(&env, &token).mint(&tenant, &1_000_000);

    let agreement =
        create_test_agreement(&env, "agr_fee_1", &tenant, &landlord, 100_000, token.clone());
    seed_agreement(&env, &client, "agr_fee_1", &agreement);

    client.set_platform_fee_collector(&platform);

    let schedule = tiers(&env, &[(0, 500)]); // 5%
    client.set_fee_schedule(&platform, &schedule);
    client.set_payer_discount(&platform, &tenant, &100); // 1% discount -> effective 4%

    client.pay_rent(&tenant, &String::from_str(&env, "agr_fee_1"), &100_000);

    let token_client = soroban_sdk::token::Client::new(&env, &token);
    // expected fee = 100_000 * 400 / 10_000 = 4_000
    assert_eq!(token_client.balance(&platform), 4_000);
    assert_eq!(token_client.balance(&landlord), 96_000);

    let split = client.get_payment_split(&String::from_str(&env, "agr_fee_1"), &0);
    assert_eq!(split.platform_amount, 4_000);
    assert_eq!(split.landlord_amount, 96_000);
}

// ─── Integration test: fee conservation across a batch of recurring payments ──

#[test]
fn test_recurring_payment_batch_fee_conservation() {
    let env = Env::default();
    env.mock_all_auths();

    let client = create_payment_contract(&env);
    let admin = Address::generate(&env);

    // Tiered schedule: [0, 999] @ 2%, [1_000, 9_999] @ 1%, [10_000, ∞) @ 0.5%
    let schedule = tiers(&env, &[(0, 200), (1_000, 100), (10_000, 50)]);
    client.set_fee_schedule(&admin, &schedule);

    let token_admin = Address::generate(&env);
    let token = create_token(&env, &token_admin);

    let landlord_a = Address::generate(&env);
    let tenant_a = Address::generate(&env);
    let landlord_b = Address::generate(&env);
    let tenant_b = Address::generate(&env);
    let landlord_c = Address::generate(&env);
    let tenant_c = Address::generate(&env);

    // Give tenant_c a partial discount to exercise stacking within the batch.
    client.set_payer_discount(&admin, &tenant_c, &20);

    let agreement_a =
        create_test_agreement(&env, "agr_batch_a", &tenant_a, &landlord_a, 500, token.clone());
    let agreement_b = create_test_agreement(
        &env,
        "agr_batch_b",
        &tenant_b,
        &landlord_b,
        5_000,
        token.clone(),
    );
    let agreement_c = create_test_agreement(
        &env,
        "agr_batch_c",
        &tenant_c,
        &landlord_c,
        50_000,
        token.clone(),
    );

    seed_agreement(&env, &client, "agr_batch_a", &agreement_a);
    seed_agreement(&env, &client, "agr_batch_b", &agreement_b);
    seed_agreement(&env, &client, "agr_batch_c", &agreement_c);

    let recurring_a = client.create_recurring_payment(
        &String::from_str(&env, "agr_batch_a"),
        &500,
        &PaymentFrequency::Monthly,
        &1,
        &100_000_000,
        &true,
    );
    let recurring_b = client.create_recurring_payment(
        &String::from_str(&env, "agr_batch_b"),
        &5_000,
        &PaymentFrequency::Monthly,
        &1,
        &100_000_000,
        &true,
    );
    let recurring_c = client.create_recurring_payment(
        &String::from_str(&env, "agr_batch_c"),
        &50_000,
        &PaymentFrequency::Monthly,
        &1,
        &100_000_000,
        &true,
    );

    // Execute each recurring payment across three monthly cycles.
    for _ in 0..3 {
        env.ledger().with_mut(|li| {
            li.timestamp += 2_592_000;
        });
        client.execute_recurring_payment(&recurring_a);
        client.execute_recurring_payment(&recurring_b);
        client.execute_recurring_payment(&recurring_c);
    }

    let mut sum_gross: i128 = 0;
    let mut sum_fee: i128 = 0;
    let mut sum_net: i128 = 0;

    for recurring_id in [&recurring_a, &recurring_b, &recurring_c] {
        let executions = client.get_payment_executions(recurring_id);
        assert_eq!(executions.len(), 3);
        for i in 0..executions.len() {
            let execution = executions.get(i).unwrap();
            // Per-execution conservation: no unit ever leaks from rounding.
            assert_eq!(execution.fee + execution.net, execution.amount);
            sum_gross += execution.amount;
            sum_fee += execution.fee;
            sum_net += execution.net;
        }
    }

    // Batch-wide conservation across every execution and every tier/discount
    // combination exercised above.
    assert_eq!(sum_net + sum_fee, sum_gross);
    // Sanity: real, non-zero fees were actually charged via the engine.
    assert!(sum_fee > 0);
}
