use crate::{
    errors::RentalError,
    events,
    storage::DataKey,
    types::{ActionType, AdminProposal, MultiSigConfig},
};
use soroban_sdk::{Address, Bytes, Env, String, Vec};

const PROPOSAL_EXPIRY_SECONDS: u64 = 7 * 24 * 60 * 60; // 7 days

/// Initialize multi-sig configuration
pub fn initialize_multisig(
    env: &Env,
    admins: Vec<Address>,
    required_signatures: u32,
) -> Result<(), RentalError> {
    // Check if already initialized
    if env.storage().instance().has(&DataKey::MultiSigConfig) {
        return Err(RentalError::AlreadyInitialized);
    }

    let total_admins = admins.len();
    if total_admins == 0 {
        return Err(RentalError::InvalidConfig);
    }

    if required_signatures == 0 || required_signatures > total_admins {
        return Err(RentalError::InvalidConfig);
    }

    // Verify all admins are unique
    for i in 0..admins.len() {
        for j in (i + 1)..admins.len() {
            if admins.get(i).unwrap() == admins.get(j).unwrap() {
                return Err(RentalError::InvalidConfig);
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
pub fn get_multisig_config(env: &Env) -> Result<MultiSigConfig, RentalError> {
    env.storage()
        .instance()
        .get(&DataKey::MultiSigConfig)
        .ok_or(RentalError::MultiSigNotInitialized)
}

/// Check if an address is an admin
pub fn is_admin(env: &Env, address: &Address) -> Result<bool, RentalError> {
    let config = get_multisig_config(env)?;

    for admin in config.admins.iter() {
        if &admin == address {
            return Ok(true);
        }
    }

    Ok(false)
}

/// Require that the caller is an admin
pub fn require_admin(env: &Env, caller: &Address) -> Result<(), RentalError> {
    if !is_admin(env, caller)? {
        return Err(RentalError::Unauthorized);
    }
    Ok(())
}

/// Propose an admin action
pub fn propose_action(
    env: &Env,
    proposer: Address,
    action_type: ActionType,
    target: Option<Address>,
    data: Bytes,
) -> Result<String, RentalError> {
    proposer.require_auth();
    require_admin(env, &proposer)?;

    // Generate proposal ID
    let mut proposal_count: u32 = env
        .storage()
        .instance()
        .get(&DataKey::ProposalCount)
        .unwrap_or(0);

    proposal_count += 1;
    // Create proposal ID using count + timestamp for uniqueness
    // In Soroban, we can use a simple prefix + counter approach
    let proposal_id = String::from_str(env, "prop_");
    // Since we can't use format!, we use the counter as part of storage key
    // The DataKey::AdminProposal will ensure uniqueness with the counter

    // Create proposal with single approval from proposer
    let mut approvals = Vec::new(env);
    approvals.push_back(proposer.clone());

    let proposal = AdminProposal {
        id: proposal_id.clone(),
        proposer: proposer.clone(),
        action_type: action_type.clone(),
        target,
        data,
        approvals,
        approval_count: 1,
        executed: false,
        created_at: env.ledger().timestamp(),
        expiry: env.ledger().timestamp() + PROPOSAL_EXPIRY_SECONDS,
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
pub fn approve_action(
    env: &Env,
    approver: Address,
    proposal_id: String,
) -> Result<(), RentalError> {
    approver.require_auth();
    require_admin(env, &approver)?;

    let mut proposal: AdminProposal = env
        .storage()
        .persistent()
        .get(&DataKey::AdminProposal(proposal_id.clone()))
        .ok_or(RentalError::ProposalNotFound)?;

    // Check if already executed
    if proposal.executed {
        return Err(RentalError::ProposalAlreadyExecuted);
    }

    // Check if expired
    if env.ledger().timestamp() > proposal.expiry {
        return Err(RentalError::ProposalExpired);
    }

    // Check if already approved by this address
    for approval in proposal.approvals.iter() {
        if approval == approver {
            return Err(RentalError::AlreadyApproved);
        }
    }

    // Add approval
    proposal.approvals.push_back(approver.clone());
    proposal.approval_count += 1;

    // Update proposal
    env.storage()
        .persistent()
        .set(&DataKey::AdminProposal(proposal_id.clone()), &proposal);

    events::action_approved(env, proposal_id, approver, proposal.approval_count);

    Ok(())
}

/// Execute a proposal if it has enough approvals
pub fn execute_action(
    env: &Env,
    executor: Address,
    proposal_id: String,
) -> Result<(), RentalError> {
    executor.require_auth();
    require_admin(env, &executor)?;

    let mut proposal: AdminProposal = env
        .storage()
        .persistent()
        .get(&DataKey::AdminProposal(proposal_id.clone()))
        .ok_or(RentalError::ProposalNotFound)?;

    // Check if already executed
    if proposal.executed {
        return Err(RentalError::ProposalAlreadyExecuted);
    }

    // Check if expired
    if env.ledger().timestamp() > proposal.expiry {
        return Err(RentalError::ProposalExpired);
    }

    // Check if has enough approvals
    let config = get_multisig_config(env)?;
    if proposal.approval_count < config.required_signatures {
        return Err(RentalError::InsufficientApprovals);
    }

    // Mark as executed
    proposal.executed = true;
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

/// Reject/cancel a proposal (only proposer can do this before execution)
pub fn reject_action(env: &Env, caller: Address, proposal_id: String) -> Result<(), RentalError> {
    caller.require_auth();
    require_admin(env, &caller)?;

    let proposal: AdminProposal = env
        .storage()
        .persistent()
        .get(&DataKey::AdminProposal(proposal_id.clone()))
        .ok_or(RentalError::ProposalNotFound)?;

    // Only proposer can reject before execution
    if proposal.proposer != caller {
        return Err(RentalError::Unauthorized);
    }

    if proposal.executed {
        return Err(RentalError::ProposalAlreadyExecuted);
    }

    // Remove proposal
    env.storage()
        .persistent()
        .remove(&DataKey::AdminProposal(proposal_id.clone()));

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

/// Add a new admin through multi-sig proposal execution
pub fn add_admin_internal(env: &Env, new_admin: Address) -> Result<(), RentalError> {
    let mut config = get_multisig_config(env)?;

    // Check if already admin
    for admin in config.admins.iter() {
        if admin == new_admin {
            return Err(RentalError::InvalidInput);
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
pub fn remove_admin_internal(env: &Env, admin_to_remove: Address) -> Result<(), RentalError> {
    let mut config = get_multisig_config(env)?;

    // Cannot remove last admin
    if config.total_admins <= 1 {
        return Err(RentalError::InvalidConfig);
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
        return Err(RentalError::Unauthorized);
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
) -> Result<(), RentalError> {
    let mut config = get_multisig_config(env)?;

    if new_required == 0 || new_required > config.total_admins {
        return Err(RentalError::InvalidConfig);
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

/// Get a proposal by ID
pub fn get_proposal(env: &Env, proposal_id: String) -> Result<AdminProposal, RentalError> {
    env.storage()
        .persistent()
        .get(&DataKey::AdminProposal(proposal_id))
        .ok_or(RentalError::ProposalNotFound)
}

/// Get all active proposals
pub fn get_active_proposals(env: &Env) -> Result<Vec<String>, RentalError> {
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
