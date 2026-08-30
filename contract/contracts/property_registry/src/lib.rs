#![no_std]

use soroban_sdk::{contract, contractimpl, Address, Env, String};

mod errors;
mod events;
mod property;
mod storage;
mod types;
mod upgrade;

#[cfg(test)]
mod tests;

pub use errors::PropertyError;
pub use property::{
    accept_transfer, cancel_transfer, get_property, get_property_count, get_transfer_proposal,
    has_property, propose_transfer, register_property, verify_property,
};
pub use storage::DataKey;
pub use types::{ContractState, PropertyDetails, TransferProposal};

#[contract]
pub struct PropertyRegistryContract;

#[contractimpl]
impl PropertyRegistryContract {
    /// Initialize the contract with an admin address.
    ///
    /// # Arguments
    /// * `admin` - The address that will have admin privileges to verify properties
    ///
    /// # Errors
    /// * `AlreadyInitialized` - If the contract has already been initialized
    pub fn initialize(env: Env, admin: Address) -> Result<(), PropertyError> {
        if env.storage().persistent().has(&DataKey::Initialized) {
            return Err(PropertyError::AlreadyInitialized);
        }

        admin.require_auth();

        env.storage().persistent().set(&DataKey::Initialized, &true);
        env.storage()
            .persistent()
            .extend_ttl(&DataKey::Initialized, 500000, 500000);

        let state = ContractState {
            admin: admin.clone(),
            initialized: true,
        };

        env.storage().instance().set(&DataKey::State, &state);
        env.storage().instance().extend_ttl(500000, 500000);

        events::contract_initialized(&env, admin);

        Ok(())
    }

    /// Get the current contract state.
    ///
    /// # Returns
    /// * `Option<ContractState>` - The contract state if initialized
    pub fn get_state(env: Env) -> Option<ContractState> {
        env.storage().instance().get(&DataKey::State)
    }

    /// Register a new property on-chain.
    ///
    /// # Arguments
    /// * `landlord` - The address of the property owner
    /// * `property_id` - A unique identifier for the property
    /// * `metadata_hash` - IPFS hash or other reference to property metadata
    ///
    /// # Errors
    /// * `NotInitialized` - If the contract hasn't been initialized
    /// * `PropertyAlreadyExists` - If a property with this ID already exists
    /// * `InvalidPropertyId` - If the property ID is empty
    /// * `InvalidMetadata` - If the metadata hash is empty
    pub fn register_property(
        env: Env,
        landlord: Address,
        property_id: String,
        metadata_hash: String,
    ) -> Result<(), PropertyError> {
        property::register_property(&env, landlord, property_id, metadata_hash)
    }

    /// Verify a registered property (admin only).
    ///
    /// # Arguments
    /// * `admin` - The admin address performing the verification
    /// * `property_id` - The ID of the property to verify
    ///
    /// # Errors
    /// * `NotInitialized` - If the contract hasn't been initialized
    /// * `Unauthorized` - If the caller is not the admin
    /// * `PropertyNotFound` - If the property doesn't exist
    /// * `AlreadyVerified` - If the property is already verified
    pub fn verify_property(
        env: Env,
        admin: Address,
        property_id: String,
    ) -> Result<(), PropertyError> {
        property::verify_property(&env, admin, property_id)
    }

    /// Propose a transfer of property ownership (two-step process).
    /// The current owner calls this to propose a new owner.
    ///
    /// # Arguments
    /// * `property_id` - The ID of the property to transfer
    /// * `new_owner` - The address of the proposed new owner
    /// * `escrow_case_id` - Optional escrow case ID that must settle before transfer
    ///
    /// # Errors
    /// * `NotInitialized` - If the contract hasn't been initialized
    /// * `PropertyNotFound` - If the property doesn't exist
    /// * `Unauthorized` - If the caller is not the current owner
    /// * `TransferProposalPending` - If a transfer proposal is already pending
    /// * `InvalidNewOwner` - If the new owner is the same as current owner
    pub fn propose_transfer(
        env: Env,
        property_id: String,
        new_owner: Address,
        escrow_case_id: Option<String>,
    ) -> Result<(), PropertyError> {
        property::propose_transfer(&env, property_id, new_owner, escrow_case_id)
    }

    /// Accept a proposed transfer of property ownership.
    /// The proposed new owner calls this to finalize the transfer.
    ///
    /// # Arguments
    /// * `property_id` - The ID of the property to accept transfer for
    ///
    /// # Errors
    /// * `NotInitialized` - If the contract hasn't been initialized
    /// * `NoTransferProposal` - If there's no pending transfer proposal
    /// * `PropertyNotFound` - If the property doesn't exist
    /// * `Unauthorized` - If the caller is not the proposed new owner
    pub fn accept_transfer(env: Env, property_id: String) -> Result<(), PropertyError> {
        property::accept_transfer(&env, property_id)
    }

    /// Cancel a pending transfer proposal.
    /// Only the current owner (proposer) can cancel.
    ///
    /// # Arguments
    /// * `property_id` - The ID of the property to cancel transfer for
    ///
    /// # Errors
    /// * `NotInitialized` - If the contract hasn't been initialized
    /// * `NoTransferProposal` - If there's no pending transfer proposal
    /// * `Unauthorized` - If the caller is not the current owner
    pub fn cancel_transfer(env: Env, property_id: String) -> Result<(), PropertyError> {
        property::cancel_transfer(&env, property_id)
    }

    /// Get a pending transfer proposal for a property.
    ///
    /// # Arguments
    /// * `property_id` - The ID of the property
    ///
    /// # Returns
    /// * `Option<TransferProposal>` - The transfer proposal if one exists
    pub fn get_transfer_proposal(env: Env, property_id: String) -> Option<TransferProposal> {
        property::get_transfer_proposal(&env, property_id)
    }

    /// Get details of a registered property.
    ///
    /// # Arguments
    /// * `property_id` - The ID of the property to retrieve
    ///
    /// # Returns
    /// * `Option<PropertyDetails>` - The property details if it exists
    pub fn get_property(env: Env, property_id: String) -> Option<PropertyDetails> {
        property::get_property(&env, property_id)
    }

    /// Check if a property exists in the registry.
    ///
    /// # Arguments
    /// * `property_id` - The ID of the property to check
    ///
    /// # Returns
    /// * `bool` - True if the property exists
    pub fn has_property(env: Env, property_id: String) -> bool {
        property::has_property(&env, property_id)
    }

    /// Get the total count of registered properties.
    ///
    /// # Returns
    /// * `u32` - The total number of properties registered
    pub fn get_property_count(env: Env) -> u32 {
        property::get_property_count(&env)
    }

    // --- Upgrade Functions ---

    /// Propose a contract upgrade (admin only).
    pub fn propose_upgrade(
        env: Env,
        proposer: Address,
        proposal_id: String,
        wasm_hash: soroban_sdk::Bytes,
        notes: String,
        delay_seconds: u64,
    ) -> Result<(), PropertyError> {
        upgrade::propose_upgrade(&env, proposer, proposal_id, wasm_hash, notes, delay_seconds)
    }

    /// Approve an upgrade proposal (admin only).
    pub fn approve_upgrade(
        env: Env,
        approver: Address,
        proposal_id: String,
    ) -> Result<(), PropertyError> {
        upgrade::approve_upgrade(&env, approver, proposal_id)
    }

    /// Execute an approved upgrade (admin only).
    pub fn execute_upgrade(
        env: Env,
        executor: Address,
        proposal_id: String,
    ) -> Result<(), PropertyError> {
        upgrade::execute_upgrade(&env, executor, proposal_id)
    }

    /// Get an upgrade proposal.
    pub fn get_upgrade_proposal(
        env: Env,
        proposal_id: String,
    ) -> Result<upgrade::UpgradeProposal, PropertyError> {
        upgrade::get_upgrade_proposal(&env, proposal_id)
    }
}
