//! Unit + integration tests for staked weighted voting: stake/reputation-derived
//! weight snapshots, quorum gating, tie resolution, and non-voter slashing math.

use super::*;
use soroban_sdk::{
    contract, contractimpl,
    testutils::{Address as _, Events, Ledger},
    Address, Env, String, Vec,
};

use crate::dispute::{Case, CaseStatus};

// ── Helpers ────────────────────────────────────────────────────────────────

fn create_contract(env: &Env) -> DisputeResolutionContractClient<'_> {
    let contract_id = env.register(DisputeResolutionContract, ());
    DisputeResolutionContractClient::new(env, &contract_id)
}

/// Inject an open (unresolved) dispute directly into storage so assignment tests
/// need not perform a cross-contract case fetch.
fn inject_open_dispute(env: &Env, client: &DisputeResolutionContractClient, dispute_id: &String) {
    env.as_contract(&client.address, || {
        let dispute = Dispute {
            case_id: dispute_id.clone(),
            details_hash: String::from_str(env, "QmStaked"),
            raised_at: env.ledger().timestamp(),
            resolved: false,
            resolved_at: None,
            votes_favor_claimant: 0,
            votes_favor_respondent: 0,
            voters: soroban_sdk::Vec::new(env),
        };
        env.storage()
            .persistent()
            .set(&DataKey::Dispute(dispute_id.clone()), &dispute);
        env.storage().persistent().set(&DataKey::Initialized, &true);
    });
}

/// Minimal registry stand-in used by the raise → assign → vote → finalize
/// integration test.
#[contract]
pub struct MockRegistry;

#[contractimpl]
impl MockRegistry {
    pub fn get_case(env: Env, case_id: String) -> Option<Case> {
        env.storage().instance().get(&case_id)
    }
}

// ── Weighting + snapshot immunity ───────────────────────────────────────────

#[test]
fn test_weight_snapshot_from_stake_and_reputation() {
    let env = Env::default();
    let client = create_contract(&env);
    let admin = Address::generate(&env);
    let a1 = Address::generate(&env);
    let a2 = Address::generate(&env);
    let dispute_id = String::from_str(&env, "staked-weight-1");

    env.mock_all_auths();
    client.initialize(&admin, &1, &Address::generate(&env));
    client.add_arbiter(&admin, &a1);
    client.add_arbiter(&admin, &a2);

    // weight = staked_amount × reputation_multiplier / 100
    client.set_arbiter_stake(&admin, &a1, &1000, &100); // 1000 × 1.00 = 1000
    client.set_arbiter_stake(&admin, &a2, &2000, &150); // 2000 × 1.50 = 3000

    inject_open_dispute(&env, &client, &dispute_id);

    let mut arbiters = Vec::new(&env);
    arbiters.push_back(a1.clone());
    arbiters.push_back(a2.clone());
    client.assign_dispute_arbiters(&admin, &dispute_id, &arbiters, &1000);

    let tally = client.get_dispute_tally(&dispute_id);
    assert_eq!(tally.total_assigned_weight, 4000);
    assert_eq!(tally.participants.get(0).unwrap().weight, 1000);
    assert_eq!(tally.participants.get(1).unwrap().weight, 3000);
    // default quorum 60% of 4000
    assert_eq!(tally.quorum_weight_required, 2400);
}

#[test]
fn test_snapshot_immune_to_later_stake_changes() {
    let env = Env::default();
    let client = create_contract(&env);
    let admin = Address::generate(&env);
    let a1 = Address::generate(&env);
    let dispute_id = String::from_str(&env, "staked-immune-1");

    env.mock_all_auths();
    client.initialize(&admin, &1, &Address::generate(&env));
    client.add_arbiter(&admin, &a1);
    client.set_arbiter_stake(&admin, &a1, &1000, &100);

    inject_open_dispute(&env, &client, &dispute_id);

    let mut arbiters = Vec::new(&env);
    arbiters.push_back(a1.clone());
    client.assign_dispute_arbiters(&admin, &dispute_id, &arbiters, &1000);

    // Attempt to game the vote by inflating stake after assignment.
    client.set_arbiter_stake(&admin, &a1, &999_999, &1000);

    let tally = client.get_dispute_tally(&dispute_id);
    // Snapshotted weight is unchanged.
    assert_eq!(tally.total_assigned_weight, 1000);
    assert_eq!(tally.participants.get(0).unwrap().weight, 1000);

    let assignment = client.get_dispute_assignment(&dispute_id).unwrap();
    assert_eq!(assignment.total_weight, 1000);
}

// ── Quorum gating ────────────────────────────────────────────────────────────

fn setup_three_equal_arbiters(
    env: &Env,
    client: &DisputeResolutionContractClient,
    admin: &Address,
    dispute_id: &String,
) -> (Address, Address, Address) {
    let a1 = Address::generate(env);
    let a2 = Address::generate(env);
    let a3 = Address::generate(env);
    client.add_arbiter(admin, &a1);
    client.add_arbiter(admin, &a2);
    client.add_arbiter(admin, &a3);
    // equal weight 1000 each → total 3000, 60% quorum = 1800
    client.set_arbiter_stake(admin, &a1, &1000, &100);
    client.set_arbiter_stake(admin, &a2, &1000, &100);
    client.set_arbiter_stake(admin, &a3, &1000, &100);

    inject_open_dispute(env, client, dispute_id);

    let mut arbiters = Vec::new(env);
    arbiters.push_back(a1.clone());
    arbiters.push_back(a2.clone());
    arbiters.push_back(a3.clone());
    client.assign_dispute_arbiters(admin, dispute_id, &arbiters, &1000);
    (a1, a2, a3)
}

#[test]
fn test_quorum_not_reached_blocks_finalize() {
    let env = Env::default();
    env.ledger().with_mut(|l| l.timestamp = 100);
    let client = create_contract(&env);
    let admin = Address::generate(&env);
    let dispute_id = String::from_str(&env, "staked-quorum-1");

    env.mock_all_auths();
    client.initialize(&admin, &1, &Address::generate(&env));
    let (a1, _a2, _a3) = setup_three_equal_arbiters(&env, &client, &admin, &dispute_id);

    // Only one of three arbiters votes: 1000 < 1800 required.
    client.cast_staked_vote(&a1, &dispute_id, &DisputeOutcome::FavorClaimant);

    let tally = client.get_dispute_tally(&dispute_id);
    assert_eq!(tally.voted_weight, 1000);
    assert!(!tally.quorum_reached);

    // Move past the deadline and attempt to finalize.
    env.ledger().with_mut(|l| l.timestamp = 100 + 2000);
    let result = client.try_finalize_dispute(&dispute_id);
    assert_eq!(result, Err(Ok(DisputeError::QuorumNotReached)));
}

#[test]
fn test_finalize_before_deadline_rejected() {
    let env = Env::default();
    env.ledger().with_mut(|l| l.timestamp = 100);
    let client = create_contract(&env);
    let admin = Address::generate(&env);
    let dispute_id = String::from_str(&env, "staked-deadline-1");

    env.mock_all_auths();
    client.initialize(&admin, &1, &Address::generate(&env));
    let (a1, a2, _a3) = setup_three_equal_arbiters(&env, &client, &admin, &dispute_id);

    client.cast_staked_vote(&a1, &dispute_id, &DisputeOutcome::FavorClaimant);
    client.cast_staked_vote(&a2, &dispute_id, &DisputeOutcome::FavorClaimant);

    // Quorum met (2000 ≥ 1800) but deadline not reached.
    let result = client.try_finalize_dispute(&dispute_id);
    assert_eq!(result, Err(Ok(DisputeError::DeadlineNotReached)));
}

#[test]
fn test_quorum_reached_allows_finalize() {
    let env = Env::default();
    env.ledger().with_mut(|l| l.timestamp = 100);
    let client = create_contract(&env);
    let admin = Address::generate(&env);
    let dispute_id = String::from_str(&env, "staked-quorum-ok");

    env.mock_all_auths();
    client.initialize(&admin, &1, &Address::generate(&env));
    let (a1, a2, _a3) = setup_three_equal_arbiters(&env, &client, &admin, &dispute_id);

    client.cast_staked_vote(&a1, &dispute_id, &DisputeOutcome::FavorClaimant);
    client.cast_staked_vote(&a2, &dispute_id, &DisputeOutcome::FavorClaimant);

    env.ledger().with_mut(|l| l.timestamp = 100 + 2000);
    let outcome = client.finalize_dispute(&dispute_id);
    assert_eq!(outcome, DisputeOutcome::FavorClaimant);

    let tally = client.get_dispute_tally(&dispute_id);
    assert!(tally.finalized);
    assert_eq!(tally.outcome, OptionalOutcome::FavorClaimant);
}

#[test]
fn test_vote_after_deadline_rejected() {
    let env = Env::default();
    env.ledger().with_mut(|l| l.timestamp = 100);
    let client = create_contract(&env);
    let admin = Address::generate(&env);
    let dispute_id = String::from_str(&env, "staked-late-vote");

    env.mock_all_auths();
    client.initialize(&admin, &1, &Address::generate(&env));
    let (a1, _a2, _a3) = setup_three_equal_arbiters(&env, &client, &admin, &dispute_id);

    env.ledger().with_mut(|l| l.timestamp = 100 + 2000);
    let result = client.try_cast_staked_vote(&a1, &dispute_id, &DisputeOutcome::FavorClaimant);
    assert_eq!(result, Err(Ok(DisputeError::VotingDeadlinePassed)));
}

#[test]
fn test_unassigned_arbiter_cannot_vote() {
    let env = Env::default();
    env.ledger().with_mut(|l| l.timestamp = 100);
    let client = create_contract(&env);
    let admin = Address::generate(&env);
    let dispute_id = String::from_str(&env, "staked-unassigned");

    env.mock_all_auths();
    client.initialize(&admin, &1, &Address::generate(&env));
    let (_a1, _a2, _a3) = setup_three_equal_arbiters(&env, &client, &admin, &dispute_id);

    let outsider = Address::generate(&env);
    client.add_arbiter(&admin, &outsider);
    let result =
        client.try_cast_staked_vote(&outsider, &dispute_id, &DisputeOutcome::FavorClaimant);
    assert_eq!(result, Err(Ok(DisputeError::ArbiterNotAssigned)));
}

// ── Tie resolution ───────────────────────────────────────────────────────────

#[test]
fn test_tie_resolved_by_earliest_vote() {
    let env = Env::default();
    env.ledger().with_mut(|l| l.timestamp = 100);
    let client = create_contract(&env);
    let admin = Address::generate(&env);
    let a1 = Address::generate(&env);
    let a2 = Address::generate(&env);
    let dispute_id = String::from_str(&env, "staked-tie-1");

    env.mock_all_auths();
    client.initialize(&admin, &1, &Address::generate(&env));
    client.add_arbiter(&admin, &a1);
    client.add_arbiter(&admin, &a2);
    // equal weights → tie in weight
    client.set_arbiter_stake(&admin, &a1, &1000, &100);
    client.set_arbiter_stake(&admin, &a2, &1000, &100);

    inject_open_dispute(&env, &client, &dispute_id);
    let mut arbiters = Vec::new(&env);
    arbiters.push_back(a1.clone());
    arbiters.push_back(a2.clone());
    // quorum 60% of 2000 = 1200; both must vote to reach it
    client.assign_dispute_arbiters(&admin, &dispute_id, &arbiters, &1000);

    // a1 votes first (earlier timestamp) for the respondent.
    env.ledger().with_mut(|l| l.timestamp = 150);
    client.cast_staked_vote(&a1, &dispute_id, &DisputeOutcome::FavorRespondent);
    env.ledger().with_mut(|l| l.timestamp = 200);
    client.cast_staked_vote(&a2, &dispute_id, &DisputeOutcome::FavorClaimant);

    env.ledger().with_mut(|l| l.timestamp = 100 + 2000);
    // 1000 vs 1000 → tie broken toward earliest vote → FavorRespondent
    let outcome = client.finalize_dispute(&dispute_id);
    assert_eq!(outcome, DisputeOutcome::FavorRespondent);
}

// ── Slashing math + conservation ────────────────────────────────────────────

#[test]
fn test_slashing_and_redistribution_conserved() {
    let env = Env::default();
    env.ledger().with_mut(|l| l.timestamp = 100);
    let client = create_contract(&env);
    let admin = Address::generate(&env);
    let a1 = Address::generate(&env);
    let a2 = Address::generate(&env);
    let a3 = Address::generate(&env);
    let a4 = Address::generate(&env);
    let dispute_id = String::from_str(&env, "staked-slash-1");

    env.mock_all_auths();
    client.initialize(&admin, &1, &Address::generate(&env));
    // slash 20% of a non-voter's stake
    client.set_quorum_config(
        &admin,
        &QuorumConfig {
            quorum_bps: 6000,
            slash_bps: 2000,
            min_voters: 1,
        },
    );

    for a in [&a1, &a2, &a3, &a4] {
        client.add_arbiter(&admin, a);
        client.set_arbiter_stake(&admin, a, &1000, &100); // weight 1000, stake 1000
    }

    inject_open_dispute(&env, &client, &dispute_id);
    let mut arbiters = Vec::new(&env);
    arbiters.push_back(a1.clone());
    arbiters.push_back(a2.clone());
    arbiters.push_back(a3.clone());
    arbiters.push_back(a4.clone());
    // total weight 4000, quorum 60% = 2400
    client.assign_dispute_arbiters(&admin, &dispute_id, &arbiters, &1000);

    // a1, a2, a3 vote (3000 ≥ 2400); a4 never votes.
    client.cast_staked_vote(&a1, &dispute_id, &DisputeOutcome::FavorClaimant);
    client.cast_staked_vote(&a2, &dispute_id, &DisputeOutcome::FavorClaimant);
    client.cast_staked_vote(&a3, &dispute_id, &DisputeOutcome::FavorRespondent);

    env.ledger().with_mut(|l| l.timestamp = 100 + 2000);
    let outcome = client.finalize_dispute(&dispute_id);
    assert_eq!(outcome, DisputeOutcome::FavorClaimant); // 2000 vs 1000

    // Slash: a4 loses 1000 × 20% = 200.
    let s4 = client.get_arbiter_stake(&a4).staked_amount;
    assert_eq!(s4, 800);

    // Redistribute 200 to voters by weight (1000 each of voted_weight 3000):
    //   floor(200 × 1000 / 3000) = 66 each → 198 distributed;
    //   remainder 2 → first voter (a1).
    let s1 = client.get_arbiter_stake(&a1).staked_amount;
    let s2 = client.get_arbiter_stake(&a2).staked_amount;
    let s3 = client.get_arbiter_stake(&a3).staked_amount;
    assert_eq!(s1, 1000 + 66 + 2);
    assert_eq!(s2, 1000 + 66);
    assert_eq!(s3, 1000 + 66);

    // Conservation: total slashed == total redistributed.
    let slashed = 1000 - s4;
    let redistributed = (s1 - 1000) + (s2 - 1000) + (s3 - 1000);
    assert_eq!(slashed, 200);
    assert_eq!(slashed, redistributed);
}

#[test]
fn test_no_slash_when_all_vote() {
    let env = Env::default();
    env.ledger().with_mut(|l| l.timestamp = 100);
    let client = create_contract(&env);
    let admin = Address::generate(&env);
    let dispute_id = String::from_str(&env, "staked-noslash");

    env.mock_all_auths();
    client.initialize(&admin, &1, &Address::generate(&env));
    let (a1, a2, a3) = setup_three_equal_arbiters(&env, &client, &admin, &dispute_id);

    client.cast_staked_vote(&a1, &dispute_id, &DisputeOutcome::FavorClaimant);
    client.cast_staked_vote(&a2, &dispute_id, &DisputeOutcome::FavorClaimant);
    client.cast_staked_vote(&a3, &dispute_id, &DisputeOutcome::FavorRespondent);

    env.ledger().with_mut(|l| l.timestamp = 100 + 2000);
    client.finalize_dispute(&dispute_id);

    // Everyone participated → stakes untouched.
    assert_eq!(client.get_arbiter_stake(&a1).staked_amount, 1000);
    assert_eq!(client.get_arbiter_stake(&a2).staked_amount, 1000);
    assert_eq!(client.get_arbiter_stake(&a3).staked_amount, 1000);
}

#[test]
fn test_double_finalize_rejected() {
    let env = Env::default();
    env.ledger().with_mut(|l| l.timestamp = 100);
    let client = create_contract(&env);
    let admin = Address::generate(&env);
    let dispute_id = String::from_str(&env, "staked-double-final");

    env.mock_all_auths();
    client.initialize(&admin, &1, &Address::generate(&env));
    let (a1, a2, _a3) = setup_three_equal_arbiters(&env, &client, &admin, &dispute_id);

    client.cast_staked_vote(&a1, &dispute_id, &DisputeOutcome::FavorClaimant);
    client.cast_staked_vote(&a2, &dispute_id, &DisputeOutcome::FavorClaimant);

    env.ledger().with_mut(|l| l.timestamp = 100 + 2000);
    client.finalize_dispute(&dispute_id);
    let again = client.try_finalize_dispute(&dispute_id);
    assert_eq!(again, Err(Ok(DisputeError::AlreadyFinalized)));
}

#[test]
fn test_invalid_quorum_config_rejected() {
    let env = Env::default();
    let client = create_contract(&env);
    let admin = Address::generate(&env);

    env.mock_all_auths();
    client.initialize(&admin, &1, &Address::generate(&env));

    // quorum_bps == 0 is invalid
    let r = client.try_set_quorum_config(
        &admin,
        &QuorumConfig {
            quorum_bps: 0,
            slash_bps: 2000,
            min_voters: 1,
        },
    );
    assert_eq!(r, Err(Ok(DisputeError::InvalidQuorumConfig)));

    // slash_bps > 10000 is invalid
    let r = client.try_set_quorum_config(
        &admin,
        &QuorumConfig {
            quorum_bps: 6000,
            slash_bps: 10001,
            min_voters: 1,
        },
    );
    assert_eq!(r, Err(Ok(DisputeError::InvalidQuorumConfig)));

    // min_voters == 0 is invalid
    let r = client.try_set_quorum_config(
        &admin,
        &QuorumConfig {
            quorum_bps: 6000,
            slash_bps: 2000,
            min_voters: 0,
        },
    );
    assert_eq!(r, Err(Ok(DisputeError::InvalidQuorumConfig)));
}

// ── Integration: raise → assign → vote → finalize ───────────────────────────

#[test]
fn test_full_flow_raise_assign_vote_finalize() {
    let env = Env::default();
    env.mock_all_auths();
    env.ledger().with_mut(|l| l.timestamp = 1_000);

    let client = create_contract(&env);
    let admin = Address::generate(&env);
    let case_registry = env.register(MockRegistry, ());

    let claimant = Address::generate(&env);
    let respondent = Address::generate(&env);
    let a1 = Address::generate(&env);
    let a2 = Address::generate(&env);
    let a3 = Address::generate(&env);

    // Seed the registry with an active case.
    let case_id = String::from_str(&env, "case-integration-1");
    let case = Case {
        case_id: case_id.clone(),
        claimant: claimant.clone(),
        respondent: respondent.clone(),
        status: CaseStatus::Active,
    };
    env.as_contract(&case_registry, || {
        env.storage().instance().set(&case_id, &case);
    });

    client.initialize(&admin, &1, &case_registry);
    client.add_arbiter(&admin, &a1);
    client.add_arbiter(&admin, &a2);
    client.add_arbiter(&admin, &a3);
    client.set_arbiter_stake(&admin, &a1, &2000, &100); // weight 2000
    client.set_arbiter_stake(&admin, &a2, &1000, &100); // weight 1000
    client.set_arbiter_stake(&admin, &a3, &1000, &100); // weight 1000, will ghost

    // Raise the dispute through the real cross-contract path.
    let details = String::from_str(&env, "QmEvidence");
    client.raise_dispute(&respondent, &case_id, &details);

    // Assign arbiters (snapshots weights). total 4000, quorum 60% = 2400.
    let mut arbiters = Vec::new(&env);
    arbiters.push_back(a1.clone());
    arbiters.push_back(a2.clone());
    arbiters.push_back(a3.clone());
    client.assign_dispute_arbiters(&admin, &case_id, &arbiters, &1000);

    // a1 + a2 vote claimant (weight 3000 ≥ 2400 quorum); a3 ghosts.
    client.cast_staked_vote(&a1, &case_id, &DisputeOutcome::FavorClaimant);
    client.cast_staked_vote(&a2, &case_id, &DisputeOutcome::FavorClaimant);

    // Progress-tracking read before finalize.
    let mid = client.get_dispute_tally(&case_id);
    assert_eq!(mid.voted_weight, 3000);
    assert!(mid.quorum_reached);
    assert!(!mid.finalized);

    // Finalize after the deadline.
    env.ledger().with_mut(|l| l.timestamp = 1_000 + 2_000);
    let outcome = client.finalize_dispute(&case_id);
    assert_eq!(outcome, DisputeOutcome::FavorClaimant);

    // Underlying dispute marked resolved.
    let dispute = client.get_dispute(&case_id).unwrap();
    assert!(dispute.resolved);
    assert!(dispute.resolved_at.is_some());

    // a3 slashed 1000 × 20% (default) = 200, redistributed to a1/a2.
    assert_eq!(client.get_arbiter_stake(&a3).staked_amount, 800);
    let s1 = client.get_arbiter_stake(&a1).staked_amount;
    let s2 = client.get_arbiter_stake(&a2).staked_amount;
    // conservation
    assert_eq!((s1 - 2000) + (s2 - 1000), 200);

    let final_tally = client.get_dispute_tally(&case_id);
    assert!(final_tally.finalized);
    assert_eq!(final_tally.outcome, OptionalOutcome::FavorClaimant);
    // a3 participation recorded as non-voting.
    let a3_row = final_tally
        .participants
        .iter()
        .find(|p| p.arbiter == a3)
        .unwrap();
    assert!(!a3_row.voted);
}

// ── Min-voter-count quorum ───────────────────────────────────────────────────

#[test]
fn test_min_voter_count_blocks_finalize_despite_weight_quorum() {
    let env = Env::default();
    env.ledger().with_mut(|l| l.timestamp = 100);
    let client = create_contract(&env);
    let admin = Address::generate(&env);
    let dispute_id = String::from_str(&env, "staked-min-voters-1");

    env.mock_all_auths();
    client.initialize(&admin, &1, &Address::generate(&env));
    // Require at least 3 distinct voters, independent of weight.
    client.set_quorum_config(
        &admin,
        &QuorumConfig {
            quorum_bps: 6000,
            slash_bps: 2000,
            min_voters: 3,
        },
    );

    let a1 = Address::generate(&env);
    let a2 = Address::generate(&env);
    let a3 = Address::generate(&env);
    let a4 = Address::generate(&env);
    client.add_arbiter(&admin, &a1);
    client.add_arbiter(&admin, &a2);
    client.add_arbiter(&admin, &a3);
    client.add_arbiter(&admin, &a4);
    // a1 alone dwarfs everyone else's weight.
    client.set_arbiter_stake(&admin, &a1, &10_000, &100); // weight 10000
    client.set_arbiter_stake(&admin, &a2, &100, &100); // weight 100
    client.set_arbiter_stake(&admin, &a3, &100, &100); // weight 100
    client.set_arbiter_stake(&admin, &a4, &100, &100); // weight 100

    inject_open_dispute(&env, &client, &dispute_id);
    let mut arbiters = Vec::new(&env);
    arbiters.push_back(a1.clone());
    arbiters.push_back(a2.clone());
    arbiters.push_back(a3.clone());
    arbiters.push_back(a4.clone());
    // total weight 10300, 60% quorum = 6180 — a1 alone clears this.
    client.assign_dispute_arbiters(&admin, &dispute_id, &arbiters, &1000);

    client.cast_staked_vote(&a1, &dispute_id, &DisputeOutcome::FavorClaimant);

    let tally = client.get_dispute_tally(&dispute_id);
    assert!(tally.voted_weight >= tally.quorum_weight_required);
    assert_eq!(tally.voter_count, 1);
    assert!(!tally.quorum_reached); // voter-count gate not met

    env.ledger().with_mut(|l| l.timestamp = 100 + 2000);
    let result = client.try_finalize_dispute(&dispute_id);
    assert_eq!(result, Err(Ok(DisputeError::QuorumNotReached)));

    // Two more (low-weight) votes satisfy the voter-count gate.
    env.ledger().with_mut(|l| l.timestamp = 100);
    client.cast_staked_vote(&a2, &dispute_id, &DisputeOutcome::FavorClaimant);
    client.cast_staked_vote(&a3, &dispute_id, &DisputeOutcome::FavorClaimant);

    let tally = client.get_dispute_tally(&dispute_id);
    assert_eq!(tally.voter_count, 3);
    assert!(tally.quorum_reached);

    env.ledger().with_mut(|l| l.timestamp = 100 + 2000);
    let outcome = client.finalize_dispute(&dispute_id);
    assert_eq!(outcome, DisputeOutcome::FavorClaimant);
}

#[test]
fn test_assignment_rejects_unreachable_min_voters() {
    let env = Env::default();
    let client = create_contract(&env);
    let admin = Address::generate(&env);
    let dispute_id = String::from_str(&env, "staked-min-voters-unreachable");

    env.mock_all_auths();
    client.initialize(&admin, &1, &Address::generate(&env));
    client.set_quorum_config(
        &admin,
        &QuorumConfig {
            quorum_bps: 6000,
            slash_bps: 2000,
            min_voters: 5,
        },
    );

    let a1 = Address::generate(&env);
    let a2 = Address::generate(&env);
    client.add_arbiter(&admin, &a1);
    client.add_arbiter(&admin, &a2);
    client.set_arbiter_stake(&admin, &a1, &1000, &100);
    client.set_arbiter_stake(&admin, &a2, &1000, &100);

    inject_open_dispute(&env, &client, &dispute_id);
    let mut arbiters = Vec::new(&env);
    arbiters.push_back(a1.clone());
    arbiters.push_back(a2.clone());

    // Only 2 arbiters assigned but 5 voters are required — can never reach quorum.
    let result = client.try_assign_dispute_arbiters(&admin, &dispute_id, &arbiters, &1000);
    assert_eq!(result, Err(Ok(DisputeError::QuorumUnreachable)));
}

// ── `quorum_reached` event ───────────────────────────────────────────────────

#[test]
fn test_quorum_reached_event_emitted_once_on_crossing_vote() {
    let env = Env::default();
    env.ledger().with_mut(|l| l.timestamp = 100);
    let client = create_contract(&env);
    let admin = Address::generate(&env);
    let dispute_id = String::from_str(&env, "staked-quorum-event-1");

    env.mock_all_auths();
    client.initialize(&admin, &1, &Address::generate(&env));
    let (a1, a2, a3) = setup_three_equal_arbiters(&env, &client, &admin, &dispute_id);
    // total weight 3000, 60% quorum = 1800; default min_voters = 1.

    // First vote (weight 1000) does not cross the 1800 threshold — no event.
    // (`env.events().all()` reflects only the most recent top-level call.)
    client.cast_staked_vote(&a1, &dispute_id, &DisputeOutcome::FavorClaimant);
    assert_eq!(env.events().all().len(), 1); // only staked_vote_cast
    assert!(!client.get_dispute_tally(&dispute_id).quorum_reached);

    // Second vote (weight 2000 total) crosses quorum — emits quorum_reached
    // in addition to staked_vote_cast.
    client.cast_staked_vote(&a2, &dispute_id, &DisputeOutcome::FavorClaimant);
    assert_eq!(env.events().all().len(), 2);
    assert!(client.get_dispute_tally(&dispute_id).quorum_reached);

    // Third vote: quorum was already crossed, so no additional quorum_reached.
    client.cast_staked_vote(&a3, &dispute_id, &DisputeOutcome::FavorRespondent);
    assert_eq!(env.events().all().len(), 1); // only staked_vote_cast

    // The at-quorum ruling finalizes cleanly once the deadline passes.
    env.ledger().with_mut(|l| l.timestamp = 100 + 2000);
    let outcome = client.finalize_dispute(&dispute_id);
    assert_eq!(outcome, DisputeOutcome::FavorClaimant);
}

#[test]
fn test_below_quorum_finalization_fails_and_no_quorum_event() {
    let env = Env::default();
    env.ledger().with_mut(|l| l.timestamp = 100);
    let client = create_contract(&env);
    let admin = Address::generate(&env);
    let dispute_id = String::from_str(&env, "staked-quorum-event-below");

    env.mock_all_auths();
    client.initialize(&admin, &1, &Address::generate(&env));
    let (a1, _a2, _a3) = setup_three_equal_arbiters(&env, &client, &admin, &dispute_id);

    // Only one of three votes: 1000 < 1800 required — quorum never crosses.
    client.cast_staked_vote(&a1, &dispute_id, &DisputeOutcome::FavorClaimant);
    assert_eq!(env.events().all().len(), 1); // only staked_vote_cast, no quorum_reached

    env.ledger().with_mut(|l| l.timestamp = 100 + 2000);
    let result = client.try_finalize_dispute(&dispute_id);
    assert_eq!(result, Err(Ok(DisputeError::QuorumNotReached)));
    assert!(!client.get_dispute_tally(&dispute_id).quorum_reached);
}
