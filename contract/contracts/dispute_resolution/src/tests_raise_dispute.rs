use crate::dispute::{Case, CaseStatus};
use crate::{
    DisputeError, DisputeOutcome, DisputeResolutionContract, DisputeResolutionContractClient,
};
use soroban_sdk::{contract, contractimpl, testutils::Address as _, Address, Env, String};

fn create_contract(env: &Env) -> DisputeResolutionContractClient<'_> {
    let contract_id = env.register(DisputeResolutionContract, ());
    DisputeResolutionContractClient::new(env, &contract_id)
}

/// Minimal stand-in registry contract used to validate `dispute_resolution::raise_dispute`'s
/// cross-contract case fetch (`symbol_short!("get_case")`). Any real registry (escrow,
/// freelance, trade-finance, insurance, ...) implements the same `get_case` shape.
///
/// Storage layout:
/// - instance key: `case_id` -> `Case`
#[contract]
pub struct MockCaseRegistryContract;

#[contractimpl]
impl MockCaseRegistryContract {
    pub fn get_case(env: Env, case_id: String) -> Option<Case> {
        env.storage().instance().get(&case_id)
    }
}

fn deploy_mock_case_registry(env: &Env) -> Address {
    env.register(MockCaseRegistryContract, ())
}

fn put_case(env: &Env, case_registry: &Address, case: &Case) {
    env.as_contract(case_registry, || {
        env.storage().instance().set(&case.case_id, case);
    });
}

fn sample_case(
    case_id: &String,
    claimant: &Address,
    respondent: &Address,
    status: CaseStatus,
) -> Case {
    Case {
        case_id: case_id.clone(),
        claimant: claimant.clone(),
        respondent: respondent.clone(),
        status,
    }
}

#[test]
fn raise_dispute_success_cross_contract_respondent() {
    let env = Env::default();
    env.mock_all_auths();

    let client = create_contract(&env);
    let admin = Address::generate(&env);
    let case_registry = deploy_mock_case_registry(&env);

    let claimant = Address::generate(&env);
    let respondent = Address::generate(&env);

    let case_id = String::from_str(&env, "agr-respondent-1");
    let case = sample_case(
        &case_id,
        &claimant,
        &respondent,
        CaseStatus::Active,
    );
    put_case(&env, &case_registry, &case);

    client.initialize(&admin, &3, &case_registry);

    let details_hash = String::from_str(&env, "QmDetails");
    let result = client.try_raise_dispute(&respondent, &case_id, &details_hash);
    assert_eq!(result, Ok(Ok(())));

    let dispute = client.get_dispute(&case_id).unwrap();
    assert_eq!(dispute.case_id, case_id);
    assert_eq!(dispute.details_hash, details_hash);
    assert!(!dispute.resolved);
}

#[test]
fn raise_dispute_success_cross_contract_claimant() {
    let env = Env::default();
    env.mock_all_auths();

    let client = create_contract(&env);
    let admin = Address::generate(&env);
    let case_registry = deploy_mock_case_registry(&env);

    let claimant = Address::generate(&env);
    let respondent = Address::generate(&env);

    let case_id = String::from_str(&env, "agr-claimant-1");
    let case = sample_case(
        &case_id,
        &claimant,
        &respondent,
        CaseStatus::Active,
    );
    put_case(&env, &case_registry, &case);

    client.initialize(&admin, &3, &case_registry);

    let details_hash = String::from_str(&env, "QmDetails");
    let result = client.try_raise_dispute(&claimant, &case_id, &details_hash);
    assert_eq!(result, Ok(Ok(())));
}

#[test]
fn raise_dispute_fails_invalid_details_hash() {
    let env = Env::default();
    env.mock_all_auths();

    let client = create_contract(&env);
    let admin = Address::generate(&env);
    let case_registry = deploy_mock_case_registry(&env);

    let claimant = Address::generate(&env);
    let respondent = Address::generate(&env);
    let case_id = String::from_str(&env, "agr-empty-details");
    let case = sample_case(
        &case_id,
        &claimant,
        &respondent,
        CaseStatus::Active,
    );
    put_case(&env, &case_registry, &case);

    client.initialize(&admin, &3, &case_registry);

    let empty = String::from_str(&env, "");
    let result = client.try_raise_dispute(&respondent, &case_id, &empty);
    assert_eq!(result, Err(Ok(DisputeError::InvalidDetailsHash)));
}

#[test]
fn raise_dispute_fails_agreement_not_found() {
    let env = Env::default();
    env.mock_all_auths();

    let client = create_contract(&env);
    let admin = Address::generate(&env);
    let case_registry = deploy_mock_case_registry(&env);

    client.initialize(&admin, &3, &case_registry);

    let respondent = Address::generate(&env);
    let missing_id = String::from_str(&env, "missing");
    let details_hash = String::from_str(&env, "QmDetails");

    let result = client.try_raise_dispute(&respondent, &missing_id, &details_hash);
    assert_eq!(result, Err(Ok(DisputeError::CaseNotFound)));
}

#[test]
fn raise_dispute_fails_invalid_agreement_state() {
    let env = Env::default();
    env.mock_all_auths();

    let client = create_contract(&env);
    let admin = Address::generate(&env);
    let case_registry = deploy_mock_case_registry(&env);

    let claimant = Address::generate(&env);
    let respondent = Address::generate(&env);
    let case_id = String::from_str(&env, "agr-draft");
    let case = sample_case(
        &case_id,
        &claimant,
        &respondent,
        CaseStatus::Draft,
    );
    put_case(&env, &case_registry, &case);

    client.initialize(&admin, &3, &case_registry);

    let details_hash = String::from_str(&env, "QmDetails");
    let result = client.try_raise_dispute(&respondent, &case_id, &details_hash);
    assert_eq!(result, Err(Ok(DisputeError::InvalidCaseState)));
}

#[test]
fn raise_dispute_fails_unauthorized_raiser() {
    let env = Env::default();
    env.mock_all_auths();

    let client = create_contract(&env);
    let admin = Address::generate(&env);
    let case_registry = deploy_mock_case_registry(&env);

    let claimant = Address::generate(&env);
    let respondent = Address::generate(&env);
    let stranger = Address::generate(&env);

    let case_id = String::from_str(&env, "agr-stranger");
    let case = sample_case(
        &case_id,
        &claimant,
        &respondent,
        CaseStatus::Active,
    );
    put_case(&env, &case_registry, &case);

    client.initialize(&admin, &3, &case_registry);

    let details_hash = String::from_str(&env, "QmDetails");
    let result = client.try_raise_dispute(&stranger, &case_id, &details_hash);
    assert_eq!(result, Err(Ok(DisputeError::Unauthorized)));
}

#[test]
fn raise_dispute_fails_when_dispute_already_exists() {
    let env = Env::default();
    env.mock_all_auths();

    let client = create_contract(&env);
    let admin = Address::generate(&env);
    let case_registry = deploy_mock_case_registry(&env);

    let claimant = Address::generate(&env);
    let respondent = Address::generate(&env);
    let case_id = String::from_str(&env, "agr-dup");
    let case = sample_case(
        &case_id,
        &claimant,
        &respondent,
        CaseStatus::Active,
    );
    put_case(&env, &case_registry, &case);

    client.initialize(&admin, &3, &case_registry);

    let details_hash = String::from_str(&env, "QmDetails");
    let first = client.try_raise_dispute(&respondent, &case_id, &details_hash);
    assert_eq!(first, Ok(Ok(())));

    let second = client.try_raise_dispute(&respondent, &case_id, &details_hash);
    assert_eq!(second, Err(Ok(DisputeError::DisputeAlreadyExists)));
}

#[test]
fn vote_on_dispute_happy_path_after_raise_dispute() {
    let env = Env::default();
    env.mock_all_auths();

    let client = create_contract(&env);
    let admin = Address::generate(&env);
    let case_registry = deploy_mock_case_registry(&env);

    let claimant = Address::generate(&env);
    let respondent = Address::generate(&env);
    let arbiter = Address::generate(&env);

    let case_id = String::from_str(&env, "agr-vote-1");
    let case = sample_case(
        &case_id,
        &claimant,
        &respondent,
        CaseStatus::Active,
    );
    put_case(&env, &case_registry, &case);

    client.initialize(&admin, &3, &case_registry);
    client.add_arbiter(&admin, &arbiter);

    let details_hash = String::from_str(&env, "QmDetails");
    let raise = client.try_raise_dispute(&respondent, &case_id, &details_hash);
    assert_eq!(raise, Ok(Ok(())));

    let vote = client.try_vote_on_dispute(&arbiter, &case_id, &true);
    assert_eq!(vote, Ok(Ok(())));

    let dispute = client.get_dispute(&case_id).unwrap();
    assert_eq!(dispute.votes_favor_claimant, 1);
    assert_eq!(dispute.votes_favor_respondent, 0);
}

#[test]
fn resolve_dispute_favor_claimant_after_raise_dispute() {
    let env = Env::default();
    env.mock_all_auths();

    let client = create_contract(&env);
    let admin = Address::generate(&env);
    let case_registry = deploy_mock_case_registry(&env);

    let claimant = Address::generate(&env);
    let respondent = Address::generate(&env);
    let a1 = Address::generate(&env);
    let a2 = Address::generate(&env);
    let a3 = Address::generate(&env);

    let case_id = String::from_str(&env, "agr-resolve-ll");
    let case = sample_case(
        &case_id,
        &claimant,
        &respondent,
        CaseStatus::Active,
    );
    put_case(&env, &case_registry, &case);

    client.initialize(&admin, &3, &case_registry);
    client.add_arbiter(&admin, &a1);
    client.add_arbiter(&admin, &a2);
    client.add_arbiter(&admin, &a3);

    let details_hash = String::from_str(&env, "QmDetails");
    let raise = client.try_raise_dispute(&respondent, &case_id, &details_hash);
    assert_eq!(raise, Ok(Ok(())));

    assert_eq!(
        client.try_vote_on_dispute(&a1, &case_id, &true),
        Ok(Ok(()))
    );
    assert_eq!(
        client.try_vote_on_dispute(&a2, &case_id, &true),
        Ok(Ok(()))
    );
    assert_eq!(
        client.try_vote_on_dispute(&a3, &case_id, &false),
        Ok(Ok(()))
    );

    let resolved = client.try_resolve_dispute(&case_id);
    assert_eq!(resolved, Ok(Ok(DisputeOutcome::FavorClaimant)));
}

#[test]
fn resolve_dispute_insufficient_votes_after_raise_dispute() {
    let env = Env::default();
    env.mock_all_auths();

    let client = create_contract(&env);
    let admin = Address::generate(&env);
    let case_registry = deploy_mock_case_registry(&env);

    let claimant = Address::generate(&env);
    let respondent = Address::generate(&env);
    let a1 = Address::generate(&env);

    let case_id = String::from_str(&env, "agr-resolve-insufficient");
    let case = sample_case(
        &case_id,
        &claimant,
        &respondent,
        CaseStatus::Active,
    );
    put_case(&env, &case_registry, &case);

    client.initialize(&admin, &3, &case_registry);
    client.add_arbiter(&admin, &a1);

    let details_hash = String::from_str(&env, "QmDetails");
    let raise = client.try_raise_dispute(&respondent, &case_id, &details_hash);
    assert_eq!(raise, Ok(Ok(())));

    assert_eq!(
        client.try_vote_on_dispute(&a1, &case_id, &true),
        Ok(Ok(()))
    );

    let resolved = client.try_resolve_dispute(&case_id);
    assert_eq!(resolved, Err(Ok(DisputeError::InsufficientVotes)));
}
