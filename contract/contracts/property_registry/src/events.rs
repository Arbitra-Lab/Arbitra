use soroban_sdk::{contractevent, Address, Env, String};

/// Event emitted when the contract is initialized
/// Topics: ["initialized", admin: Address]
#[contractevent(topics = ["initialized"])]
pub struct ContractInitialized {
    #[topic]
    pub admin: Address,
}

/// Event emitted when a property is registered
/// Topics: ["property_registered", landlord: Address, property_id: String]
#[contractevent(topics = ["property_registered"])]
pub struct PropertyRegistered {
    #[topic]
    pub landlord: Address,
    #[topic]
    pub property_id: String,
    pub metadata_hash: String,
}

/// Event emitted when a property is verified
/// Topics: ["property_verified", admin: Address, property_id: String]
#[contractevent(topics = ["property_verified"])]
pub struct PropertyVerified {
    #[topic]
    pub admin: Address,
    #[topic]
    pub property_id: String,
}

/// Event emitted when a transfer is proposed
/// Topics: ["transfer_proposed", property_id: String, current_owner: Address, proposed_new_owner: Address]
#[contractevent(topics = ["transfer_proposed"])]
pub struct TransferProposed {
    #[topic]
    pub property_id: String,
    #[topic]
    pub current_owner: Address,
    #[topic]
    pub proposed_new_owner: Address,
    pub escrow_case_id: Option<String>,
}

/// Event emitted when a transfer is completed
/// Topics: ["transfer_completed", property_id: String, previous_owner: Address, new_owner: Address]
#[contractevent(topics = ["transfer_completed"])]
pub struct TransferCompleted {
    #[topic]
    pub property_id: String,
    #[topic]
    pub previous_owner: Address,
    #[topic]
    pub new_owner: Address,
}

/// Event emitted when a transfer proposal is cancelled
/// Topics: ["transfer_cancelled", property_id: String, proposed_new_owner: Address]
#[contractevent(topics = ["transfer_cancelled"])]
pub struct TransferCancelled {
    #[topic]
    pub property_id: String,
    #[topic]
    pub proposed_new_owner: Address,
}

/// Helper function to emit contract initialized event
pub(crate) fn contract_initialized(env: &Env, admin: Address) {
    ContractInitialized { admin }.publish(env);
}

/// Helper function to emit property registered event
pub(crate) fn property_registered(
    env: &Env,
    property_id: String,
    landlord: Address,
    metadata_hash: String,
) {
    PropertyRegistered {
        landlord,
        property_id,
        metadata_hash,
    }
    .publish(env);
}

/// Helper function to emit property verified event
pub(crate) fn property_verified(env: &Env, property_id: String, admin: Address) {
    PropertyVerified { admin, property_id }.publish(env);
}

/// Helper function to emit transfer proposed event
pub(crate) fn transfer_proposed(
    env: &Env,
    property_id: String,
    current_owner: Address,
    proposed_new_owner: Address,
    escrow_case_id: Option<String>,
) {
    TransferProposed {
        property_id,
        current_owner,
        proposed_new_owner,
        escrow_case_id,
    }
    .publish(env);
}

/// Helper function to emit transfer completed event
pub(crate) fn transfer_completed(
    env: &Env,
    property_id: String,
    previous_owner: Address,
    new_owner: Address,
) {
    TransferCompleted {
        property_id,
        previous_owner,
        new_owner,
    }
    .publish(env);
}

/// Helper function to emit transfer cancelled event
pub(crate) fn transfer_cancelled(env: &Env, property_id: String, proposed_new_owner: Address) {
    TransferCancelled {
        property_id,
        proposed_new_owner,
    }
    .publish(env);
}
