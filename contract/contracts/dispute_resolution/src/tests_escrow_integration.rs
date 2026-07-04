//! End-to-end test proving `escrow` and `dispute_resolution` interoperate through
//! the generic arbitrable-case interface: an escrow is created and funded, then
//! `dispute_resolution::raise_dispute` cross-calls `escrow::get_case` to validate
//! the case before opening a dispute on it - no housing-specific coupling involved.
use escrow::escrow_impl::EscrowContractClient;
use escrow::EscrowContract;
use soroban_sdk::token::StellarAssetClient as TokenAdminClient;
use soroban_sdk::{testutils::Address as _, Address, BytesN, Env, String};

use crate::{DisputeResolutionContract, DisputeResolutionContractClient};

fn hex_encode(env: &Env, bytes: &BytesN<32>) -> String {
    const HEX: &[u8; 16] = b"0123456789abcdef";
    let arr = bytes.to_array();
    let mut buf = [0u8; 64];
    for i in 0..32 {
        buf[i * 2] = HEX[(arr[i] >> 4) as usize];
        buf[i * 2 + 1] = HEX[(arr[i] & 0x0f) as usize];
    }
    String::from_bytes(env, &buf)
}

#[test]
fn raise_dispute_against_escrow_case() {
    let env = Env::default();
    env.mock_all_auths();

    // Deploy the escrow contract acting as the case registry.
    let escrow_id = env.register(EscrowContract, ());
    let escrow_client = EscrowContractClient::new(&env, &escrow_id);

    let depositor = Address::generate(&env);
    let beneficiary = Address::generate(&env);
    let arbiter = Address::generate(&env);
    let token_admin = Address::generate(&env);
    let token = env.register_stellar_asset_contract_v2(token_admin).address();

    // A plain 2-party escrow (freelance/trade-finance style): no platform
    // governance or agent referral cut, funds go entirely to the beneficiary.
    let escrow_bytes_id = escrow_client.create(
        &depositor,
        &beneficiary,
        &arbiter,
        &None,
        &None,
        &1_000i128,
        &token,
    );
    TokenAdminClient::new(&env, &token).mint(&depositor, &1_000i128);
    escrow_client.fund_escrow(&escrow_bytes_id, &depositor);

    let case_id = hex_encode(&env, &escrow_bytes_id);

    // Deploy the arbitration engine, pointed at the escrow as its case registry.
    let dispute_contract_id = env.register(DisputeResolutionContract, ());
    let dispute_client = DisputeResolutionContractClient::new(&env, &dispute_contract_id);

    let admin = Address::generate(&env);
    dispute_client.initialize(&admin, &3, &escrow_id);

    let details_hash = String::from_str(&env, "QmEscrowDisputeDetails");

    // Only the escrow's claimant (depositor) or respondent (beneficiary) may raise it.
    let result = dispute_client.try_raise_dispute(&depositor, &case_id, &details_hash);
    assert_eq!(result, Ok(Ok(())));

    let dispute = dispute_client.get_dispute(&case_id).unwrap();
    assert_eq!(dispute.case_id, case_id);
    assert!(!dispute.resolved);
}

#[test]
fn raise_dispute_fails_for_unrelated_party() {
    let env = Env::default();
    env.mock_all_auths();

    let escrow_id = env.register(EscrowContract, ());
    let escrow_client = EscrowContractClient::new(&env, &escrow_id);

    let depositor = Address::generate(&env);
    let beneficiary = Address::generate(&env);
    let arbiter = Address::generate(&env);
    let token_admin = Address::generate(&env);
    let token = env.register_stellar_asset_contract_v2(token_admin).address();

    // A plain 2-party escrow (freelance/trade-finance style): no platform
    // governance or agent referral cut, funds go entirely to the beneficiary.
    let escrow_bytes_id = escrow_client.create(
        &depositor,
        &beneficiary,
        &arbiter,
        &None,
        &None,
        &1_000i128,
        &token,
    );
    TokenAdminClient::new(&env, &token).mint(&depositor, &1_000i128);
    escrow_client.fund_escrow(&escrow_bytes_id, &depositor);
    let case_id = hex_encode(&env, &escrow_bytes_id);

    let dispute_contract_id = env.register(DisputeResolutionContract, ());
    let dispute_client = DisputeResolutionContractClient::new(&env, &dispute_contract_id);
    let admin = Address::generate(&env);
    dispute_client.initialize(&admin, &3, &escrow_id);

    let details_hash = String::from_str(&env, "QmEscrowDisputeDetails");
    let stranger = Address::generate(&env);
    let result = dispute_client.try_raise_dispute(&stranger, &case_id, &details_hash);
    assert!(result.is_err());
}

#[test]
fn raise_dispute_fails_when_case_not_found() {
    let env = Env::default();
    env.mock_all_auths();

    let escrow_id = env.register(EscrowContract, ());

    let dispute_contract_id = env.register(DisputeResolutionContract, ());
    let dispute_client = DisputeResolutionContractClient::new(&env, &dispute_contract_id);
    let admin = Address::generate(&env);
    dispute_client.initialize(&admin, &3, &escrow_id);

    let missing_case_id = hex_encode(&env, &BytesN::from_array(&env, &[9u8; 32]));
    let raiser = Address::generate(&env);
    let details_hash = String::from_str(&env, "QmDetails");
    let result = dispute_client.try_raise_dispute(&raiser, &missing_case_id, &details_hash);
    assert!(result.is_err());
}
