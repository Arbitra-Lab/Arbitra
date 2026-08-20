use soroban_sdk::{contracttype, Address, String};

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct PropertyDetails {
    pub property_id: String,
    pub landlord: Address,
    pub metadata_hash: String,
    pub verified: bool,
    pub registered_at: u64,
    pub verified_at: Option<u64>,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct ContractState {
    pub admin: Address,
    pub initialized: bool,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct TransferProposal {
    pub property_id: String,
    pub current_owner: Address,
    pub proposed_new_owner: Address,
    pub escrow_case_id: Option<String>,
    pub proposed_at: u64,
}
