use soroban_sdk::{contracttype, Address, String};

/// Storage keys for contract data
#[contracttype]
#[derive(Clone)]
pub enum DataKey {
    /// Profile data keyed by account address
    Profile(Address),

    /// Contract admin address
    Admin,

    /// Contract initialization flag
    Initialized,

    /// Upgrade proposal
    UpgradeProposal(String),

    /// Attestation keyed by (account_id, issuer) for individual attestations
    /// Stored as a composite key in persistent storage
    Attestation(Address, Address),

    /// List of all issuers for an account (used for iteration)
    AttestationIssuers(Address),
}
