use soroban_sdk::{Address, Env, String};

use crate::errors::PropertyError;
use crate::events;
use crate::storage::DataKey;
use crate::types::{ContractState, PropertyDetails, TransferProposal};

pub fn register_property(
    env: &Env,
    landlord: Address,
    property_id: String,
    metadata_hash: String,
) -> Result<(), PropertyError> {
    if !env.storage().persistent().has(&DataKey::Initialized) {
        return Err(PropertyError::NotInitialized);
    }

    landlord.require_auth();

    if property_id.is_empty() {
        return Err(PropertyError::InvalidPropertyId);
    }

    if metadata_hash.is_empty() {
        return Err(PropertyError::InvalidMetadata);
    }

    let key = DataKey::Property(property_id.clone());
    if env.storage().persistent().has(&key) {
        return Err(PropertyError::PropertyAlreadyExists);
    }

    let property = PropertyDetails {
        property_id: property_id.clone(),
        landlord: landlord.clone(),
        metadata_hash: metadata_hash.clone(),
        verified: false,
        registered_at: env.ledger().timestamp(),
        verified_at: None,
    };

    env.storage().persistent().set(&key, &property);
    env.storage().persistent().extend_ttl(&key, 500000, 500000);

    let count_key = DataKey::PropertyCount;
    let count: u32 = env.storage().persistent().get(&count_key).unwrap_or(0);
    env.storage().persistent().set(&count_key, &(count + 1));
    env.storage()
        .persistent()
        .extend_ttl(&count_key, 500000, 500000);

    events::property_registered(env, property_id, landlord, metadata_hash);

    Ok(())
}

pub fn verify_property(
    env: &Env,
    admin: Address,
    property_id: String,
) -> Result<(), PropertyError> {
    let state: ContractState = env
        .storage()
        .instance()
        .get(&DataKey::State)
        .ok_or(PropertyError::NotInitialized)?;

    admin.require_auth();

    if admin != state.admin {
        return Err(PropertyError::Unauthorized);
    }

    let key = DataKey::Property(property_id.clone());
    let mut property: PropertyDetails = env
        .storage()
        .persistent()
        .get(&key)
        .ok_or(PropertyError::PropertyNotFound)?;

    if property.verified {
        return Err(PropertyError::AlreadyVerified);
    }

    property.verified = true;
    property.verified_at = Some(env.ledger().timestamp());

    env.storage().persistent().set(&key, &property);
    env.storage().persistent().extend_ttl(&key, 500000, 500000);

    events::property_verified(env, property_id, admin);

    Ok(())
}

pub fn propose_transfer(
    env: &Env,
    property_id: String,
    new_owner: Address,
    escrow_case_id: Option<String>,
) -> Result<(), PropertyError> {
    if !env.storage().persistent().has(&DataKey::Initialized) {
        return Err(PropertyError::NotInitialized);
    }

    let prop_key = DataKey::Property(property_id.clone());
    let property: PropertyDetails = env
        .storage()
        .persistent()
        .get(&prop_key)
        .ok_or(PropertyError::PropertyNotFound)?;

    // Require authorization from the current owner
    property.landlord.require_auth();

    // Check if an address is the same (invalid transfer)
    if property.landlord == new_owner {
        return Err(PropertyError::InvalidNewOwner);
    }

    // Check if there's already a pending transfer proposal
    let transfer_key = DataKey::TransferProposal(property_id.clone());
    if env.storage().persistent().has(&transfer_key) {
        return Err(PropertyError::TransferProposalPending);
    }

    let proposal = TransferProposal {
        property_id: property_id.clone(),
        current_owner: property.landlord.clone(),
        proposed_new_owner: new_owner.clone(),
        escrow_case_id: escrow_case_id.clone(),
        proposed_at: env.ledger().timestamp(),
    };

    env.storage().persistent().set(&transfer_key, &proposal);
    env.storage()
        .persistent()
        .extend_ttl(&transfer_key, 500000, 500000);

    events::transfer_proposed(
        env,
        property_id,
        property.landlord,
        new_owner,
        escrow_case_id,
    );

    Ok(())
}

pub fn accept_transfer(env: &Env, property_id: String) -> Result<(), PropertyError> {
    if !env.storage().persistent().has(&DataKey::Initialized) {
        return Err(PropertyError::NotInitialized);
    }

    let transfer_key = DataKey::TransferProposal(property_id.clone());
    let proposal: TransferProposal = env
        .storage()
        .persistent()
        .get(&transfer_key)
        .ok_or(PropertyError::NoTransferProposal)?;

    // Require authorization from the proposed new owner
    proposal.proposed_new_owner.require_auth();

    let prop_key = DataKey::Property(property_id.clone());
    let mut property: PropertyDetails = env
        .storage()
        .persistent()
        .get(&prop_key)
        .ok_or(PropertyError::PropertyNotFound)?;

    // Update the property ownership
    let previous_owner = property.landlord.clone();
    property.landlord = proposal.proposed_new_owner.clone();

    env.storage().persistent().set(&prop_key, &property);
    env.storage()
        .persistent()
        .extend_ttl(&prop_key, 500000, 500000);

    // Remove the transfer proposal
    env.storage().persistent().remove(&transfer_key);

    events::transfer_completed(
        env,
        property_id,
        previous_owner,
        proposal.proposed_new_owner,
    );

    Ok(())
}

pub fn cancel_transfer(env: &Env, property_id: String) -> Result<(), PropertyError> {
    if !env.storage().persistent().has(&DataKey::Initialized) {
        return Err(PropertyError::NotInitialized);
    }

    let transfer_key = DataKey::TransferProposal(property_id.clone());
    let proposal: TransferProposal = env
        .storage()
        .persistent()
        .get(&transfer_key)
        .ok_or(PropertyError::NoTransferProposal)?;

    // Require authorization from the current owner (proposer)
    proposal.current_owner.require_auth();

    let proposed_new_owner = proposal.proposed_new_owner.clone();

    // Remove the transfer proposal
    env.storage().persistent().remove(&transfer_key);

    events::transfer_cancelled(env, property_id, proposed_new_owner);

    Ok(())
}

pub fn get_transfer_proposal(env: &Env, property_id: String) -> Option<TransferProposal> {
    let transfer_key = DataKey::TransferProposal(property_id);
    env.storage().persistent().get(&transfer_key)
}

pub fn get_property(env: &Env, property_id: String) -> Option<PropertyDetails> {
    let key = DataKey::Property(property_id);
    env.storage().persistent().get(&key)
}

pub fn has_property(env: &Env, property_id: String) -> bool {
    let key = DataKey::Property(property_id);
    env.storage().persistent().has(&key)
}

pub fn get_property_count(env: &Env) -> u32 {
    env.storage()
        .persistent()
        .get(&DataKey::PropertyCount)
        .unwrap_or(0)
}
