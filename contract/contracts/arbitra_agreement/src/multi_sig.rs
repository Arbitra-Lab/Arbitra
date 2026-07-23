use crate::{
    errors::AgreementError,
    events,
    storage::DataKey,
    types::{ActionType, AdminProposal, MultiSigConfig, ProposalStatus},
};
use soroban_sdk::{Address, Bytes, Env, String, Vec};

const PROPOSAL_EXPIRY_SECONDS: u64 = 7 * 24 * 60 * 60; // 7 days
const DEFAULT_TIMELOCK_DELAY: u64 = 2 * 24 * 60 * 60; // 2 days

// ─── Helper: Compute SHA256 hash of payload ────────────────────────────────

/// Compute the hash of a payload using SHA256
fn hash_payload(env: &Env, data: &Bytes) -> Bytes {
    // Use Soroban's built-in SHA256 hashing and convert to Bytes
    let hash = env.crypto().sha256(data);
    // Hash<32> implements Into<Bytes> in Soroban SDK
    hash.into()
}

// ─── Helper: Check if proposal has expired ────────────────────────────────

fn is_proposal_expired(env: &Env, proposal: &AdminProposal) -> bool {
    env.ledger().timestamp() > proposal.expiry
}

// ─── Helper: Check if proposal is ready for execution ────────────────────

fn is_timelock_satisfied(env: &Env, proposal: &AdminProposal) -> bool {
    env.ledger().timestamp() >= proposal.eta
}

// ─── Helper: Update proposal status to Expired if needed ────────────────

fn update_proposal_status_if_expired(env: &Env, proposal: &mut AdminProposal) {
    if is_proposal_expired(env, proposal) && proposal.status == ProposalStatus::Approved {
        proposal.status = ProposalStatus::Expired;
    }
}

// ─── Initialization ───────────────────────────────────────────────────────

/// Initialize multi-sig configuration
pub fn initialize_multisig(
    env: &Env,
    admins: Vec<Address>,
    required_signatures: u32,
) -> Result<(), AgreementError> {
    // Check if already initialized
    if env.storage().instance().has(&DataKey::MultiSigConfig) {
        return Err(AgreementError::AlreadyInitialized);
    }

    let total_admins = admins.len();
    if total_admins == 0 {
        return Err(AgreementError::InvalidConfig);
    }

    if required_signatures == 0 || required_signatures > total_admins {
        return Err(AgreementError::InvalidConfig);
    }

    // Verify all admins are unique
    for i in 0..admins.len() {
        for j in (i + 1)..admins.len() {
            if admins.get(i).unwrap() == admins.get(j).unwrap() {
                return Err(AgreementError::InvalidConfig);
            }
        }
    }

    let config = MultiSigConfig {
        admins,
        required_signatures,
        total_admins,
    };

    env.storage()
        .instance()
        .set(&DataKey::MultiSigConfig, &config);
    env.storage().instance().extend_ttl(500000, 500000);

    // Initialize proposal count
    env.storage().instance().set(&DataKey::ProposalCount, &0u32);

    events::multisig_initialized(env, total_admins, required_signatures);

    Ok(())
}

/// Get multi-sig configuration
pub fn get_multisig_config(env: &Env) -> Result<MultiSigConfig, AgreementError> {
    env.storage()
        .instance()
        .get(&DataKey::MultiSigConfig)
        .ok_or(AgreementError::MultiSigNotInitialized)
}

/// Check if an address is an admin
pub fn is_admin(env: &Env, address: &Address) -> Result<bool, AgreementError> {
    let config = get_multisig_config(env)?;

    for admin in config.admins.iter() {
        if &admin == address {
            return Ok(true);
        }
    }

    Ok(false)
}

/// Require that the caller is an admin
pub fn require_admin(env: &Env, caller: &Address) -> Result<(), AgreementError> {
    if !is_admin(env, caller)? {
        return Err(AgreementError::Unauthorized);
    }
    Ok(())
}

// ─── Proposal Lifecycle ──────────────────────────────────────────────────

/// Propose an admin action with timelock and payload hash verification
/// 
/// Creates a new proposal with:
/// - Payload hash bound to the proposal
/// - Configurable timelock delay before execution is allowed
/// - 7-day expiry window for the proposal
pub fn propose_action(
    env: &Env,
    proposer: Address,
    action_type: ActionType,
    target: Option<Address>,
    data: Bytes,
    timelock_delay: Option<u64>,
) -> Result<String, AgreementError> {
    proposer.require_auth();
    require_admin(env, &proposer)?;

    // Validate payload
    if data.is_empty() {
        return Err(AgreementError::InvalidInput);
    }

    // Compute payload hash
    let payload_hash = hash_payload(env, &data);

    // Use provided delay or default
    let delay = timelock_delay.unwrap_or(DEFAULT_TIMELOCK_DELAY);

    // Generate proposal ID
    let mut proposal_count: u32 = env
        .storage()
        .instance()
        .get(&DataKey::ProposalCount)
        .unwrap_or(0);

    proposal_count += 1;
    let proposal_id = String::from_str(env, "prop_");

    // Calculate timestamps
    let now = env.ledger().timestamp();
    let current_ledger = env.ledger().sequence() as u64;
    let eta = now + delay;
    let expiry = now + PROPOSAL_EXPIRY_SECONDS;

    // Create proposal with proposer as first approver
    let mut approvals = Vec::new(env);
    approvals.push_back(proposer.clone());

    let proposal = AdminProposal {
        id: proposal_id.clone(),
        proposer: proposer.clone(),
        action_type: action_type.clone(),
        target,
        data,
        payload_hash: payload_hash.clone(),
        approvals,
        approval_count: 1,
        status: ProposalStatus::Pending,
        created_ledger: current_ledger,
        created_at: now,
        expiry,
        timelock_delay: delay,
        eta,
    };

    // Store proposal
    env.storage()
        .persistent()
        .set(&DataKey::AdminProposal(proposal_id.clone()), &proposal);
    env.storage().persistent().extend_ttl(
        &DataKey::AdminProposal(proposal_id.clone()),
        500000,
        500000,
    );

    // Update proposal count
    env.storage()
        .instance()
        .set(&DataKey::ProposalCount, &proposal_count);

    // Add to active proposals list
    let mut active_proposals: Vec<String> = env
        .storage()
        .instance()
        .get(&DataKey::ActiveProposals)
        .unwrap_or(Vec::new(env));
    active_proposals.push_back(proposal_id.clone());
    env.storage()
        .instance()
        .set(&DataKey::ActiveProposals, &active_proposals);

    events::action_proposed(env, proposal_id.clone(), proposer, action_type);

    Ok(proposal_id)
}

/// Approve a proposal
/// 
/// Multiple admins must approve before a proposal can be executed. Once
/// the required signatures are reached, the timelock countdown begins.
pub fn approve_action(
    env: &Env,
    approver: Address,
    proposal_id: String,
) -> Result<(), AgreementError> {
    approver.require_auth();
    require_admin(env, &approver)?;

    let mut proposal: AdminProposal = env
        .storage()
        .persistent()
        .get(&DataKey::AdminProposal(proposal_id.clone()))
        .ok_or(AgreementError::ProposalNotFound)?;

    // Check status
    if proposal.status == ProposalStatus::Executed {
        return Err(AgreementError::ProposalAlreadyExecuted);
    }

    if proposal.status == ProposalStatus::Cancelled {
        return Err(AgreementError::InvalidState);
    }

    // Update status to Expired if needed
    update_proposal_status_if_expired(env, &mut proposal);

    if proposal.status == ProposalStatus::Expired {
        return Err(AgreementError::ProposalExpired);
    }

    // Check if already approved by this address
    for approval in proposal.approvals.iter() {
        if approval == approver {
            return Err(AgreementError::AlreadyApproved);
        }
    }

    // Add approval
    proposal.approvals.push_back(approver.clone());
    proposal.approval_count += 1;

    // Update status to Approved when threshold reached
    let config = get_multisig_config(env)?;
    if proposal.approval_count >= config.required_signatures
        && proposal.status == ProposalStatus::Pending
    {
        proposal.status = ProposalStatus::Approved;
        // Recalculate ETA when approvals threshold is reached
        let now = env.ledger().timestamp();
        proposal.eta = now + proposal.timelock_delay;
    }

    // Update proposal
    env.storage()
        .persistent()
        .set(&DataKey::AdminProposal(proposal_id.clone()), &proposal);

    events::action_approved(env, proposal_id, approver, proposal.approval_count);

    Ok(())
}

/// Execute a proposal if all conditions are met:
/// 1. Has sufficient approvals
/// 2. Timelock delay has passed
/// 3. Proposal has not expired
/// 4. Payload hash matches
pub fn execute_action(
    env: &Env,
    executor: Address,
    proposal_id: String,
    payload: Bytes,
) -> Result<(), AgreementError> {
    executor.require_auth();
    require_admin(env, &executor)?;

    let mut proposal: AdminProposal = env
        .storage()
        .persistent()
        .get(&DataKey::AdminProposal(proposal_id.clone()))
        .ok_or(AgreementError::ProposalNotFound)?;

    // Check status
    if proposal.status == ProposalStatus::Executed {
        return Err(AgreementError::ProposalAlreadyExecuted);
    }

    if proposal.status == ProposalStatus::Cancelled {
        return Err(AgreementError::InvalidState);
    }

    // Update status to Expired if needed
    update_proposal_status_if_expired(env, &mut proposal);

    if proposal.status == ProposalStatus::Expired {
        return Err(AgreementError::ProposalExpired);
    }

    // Verify payload hash matches stored hash
    let payload_hash = hash_payload(env, &payload);
    if payload_hash != proposal.payload_hash {
        return Err(AgreementError::InvalidInput);
    }

    // Check if has enough approvals
    let config = get_multisig_config(env)?;
    if proposal.approval_count < config.required_signatures {
        return Err(AgreementError::InsufficientApprovals);
    }

    // Check if timelock delay has been satisfied
    if !is_timelock_satisfied(env, &proposal) {
        return Err(AgreementError::InvalidState);
    }

    // Mark as executed
    proposal.status = ProposalStatus::Executed;
    env.storage()
        .persistent()
        .set(&DataKey::AdminProposal(proposal_id.clone()), &proposal);

    // Remove from active proposals
    let active_proposals: Vec<String> = env
        .storage()
        .instance()
        .get(&DataKey::ActiveProposals)
        .unwrap_or(Vec::new(env));

    let mut new_active = Vec::new(env);
    for id in active_proposals.iter() {
        if id != proposal_id {
            new_active.push_back(id);
        }
    }
    env.storage()
        .instance()
        .set(&DataKey::ActiveProposals, &new_active);

    events::action_executed(env, proposal_id, proposal.action_type);

    Ok(())
}

/// Cancel a proposal before it's executed
pub fn cancel_action(
    env: &Env,
    caller: Address,
    proposal_id: String,
) -> Result<(), AgreementError> {
    caller.require_auth();
    require_admin(env, &caller)?;

    let mut proposal: AdminProposal = env
        .storage()
        .persistent()
        .get(&DataKey::AdminProposal(proposal_id.clone()))
        .ok_or(AgreementError::ProposalNotFound)?;

    // Only proposer can cancel
    if proposal.proposer != caller {
        return Err(AgreementError::Unauthorized);
    }

    if proposal.status == ProposalStatus::Executed {
        return Err(AgreementError::ProposalAlreadyExecuted);
    }

    if proposal.status == ProposalStatus::Cancelled {
        return Err(AgreementError::InvalidState);
    }

    // Mark as cancelled
    proposal.status = ProposalStatus::Cancelled;
    env.storage()
        .persistent()
        .set(&DataKey::AdminProposal(proposal_id.clone()), &proposal);

    // Remove from active proposals
    let active_proposals: Vec<String> = env
        .storage()
        .instance()
        .get(&DataKey::ActiveProposals)
        .unwrap_or(Vec::new(env));

    let mut new_active = Vec::new(env);
    for id in active_proposals.iter() {
        if id != proposal_id {
            new_active.push_back(id);
        }
    }
    env.storage()
        .instance()
        .set(&DataKey::ActiveProposals, &new_active);

    events::action_rejected(env, proposal_id);

    Ok(())
}

// ─── Query Functions ────────────────────────────────────────────────────

/// Get a proposal by ID
pub fn get_proposal(env: &Env, proposal_id: String) -> Result<AdminProposal, AgreementError> {
    env.storage()
        .persistent()
        .get(&DataKey::AdminProposal(proposal_id))
        .ok_or(AgreementError::ProposalNotFound)
}

/// Check if a proposal is executable and return its status
pub fn get_proposal_status(
    env: &Env,
    proposal_id: String,
) -> Result<(ProposalStatus, bool), AgreementError> {
    let mut proposal = get_proposal(env, proposal_id)?;

    // Update status if expired
    update_proposal_status_if_expired(env, &mut proposal);

    // Check if all conditions for execution are met
    let can_execute = proposal.status == ProposalStatus::Approved
        && is_timelock_satisfied(env, &proposal)
        && !is_proposal_expired(env, &proposal);

    Ok((proposal.status, can_execute))
}

/// Get all active proposals
pub fn get_active_proposals(env: &Env) -> Result<Vec<String>, AgreementError> {
    Ok(env
        .storage()
        .instance()
        .get(&DataKey::ActiveProposals)
        .unwrap_or(Vec::new(env)))
}

/// Get proposal count
pub fn get_proposal_count(env: &Env) -> u32 {
    env.storage()
        .instance()
        .get(&DataKey::ProposalCount)
        .unwrap_or(0)
}

// ─── Admin Management (triggered by executed proposals) ────────────────

/// Add a new admin through multi-sig proposal execution
pub fn add_admin_internal(env: &Env, new_admin: Address) -> Result<(), AgreementError> {
    let mut config = get_multisig_config(env)?;

    // Check if already admin
    for admin in config.admins.iter() {
        if admin == new_admin {
            return Err(AgreementError::InvalidInput);
        }
    }

    // Add new admin
    config.admins.push_back(new_admin.clone());
    config.total_admins += 1;

    // Update storage
    env.storage()
        .instance()
        .set(&DataKey::MultiSigConfig, &config);
    env.storage().instance().extend_ttl(500000, 500000);

    events::admin_added(env, new_admin, config.total_admins);

    Ok(())
}

/// Remove an admin through multi-sig proposal execution
pub fn remove_admin_internal(env: &Env, admin_to_remove: Address) -> Result<(), AgreementError> {
    let mut config = get_multisig_config(env)?;

    // Cannot remove last admin
    if config.total_admins <= 1 {
        return Err(AgreementError::InvalidConfig);
    }

    // Find and remove admin
    let mut found = false;
    let mut new_admins = Vec::new(env);

    for admin in config.admins.iter() {
        if admin == admin_to_remove {
            found = true;
        } else {
            new_admins.push_back(admin);
        }
    }

    if !found {
        return Err(AgreementError::Unauthorized);
    }

    config.admins = new_admins;
    config.total_admins -= 1;

    // Adjust required signatures if needed
    if config.required_signatures > config.total_admins {
        config.required_signatures = config.total_admins;
    }

    // Update storage
    env.storage()
        .instance()
        .set(&DataKey::MultiSigConfig, &config);
    env.storage().instance().extend_ttl(500000, 500000);

    events::admin_removed(env, admin_to_remove, config.total_admins);

    Ok(())
}

/// Update required signatures through multi-sig proposal execution
pub fn update_required_signatures_internal(
    env: &Env,
    new_required: u32,
) -> Result<(), AgreementError> {
    let mut config = get_multisig_config(env)?;

    if new_required == 0 || new_required > config.total_admins {
        return Err(AgreementError::InvalidConfig);
    }

    let old_required = config.required_signatures;
    config.required_signatures = new_required;

    // Update storage
    env.storage()
        .instance()
        .set(&DataKey::MultiSigConfig, &config);
    env.storage().instance().extend_ttl(500000, 500000);

    events::required_signatures_updated(env, old_required, new_required);

    Ok(())
}
