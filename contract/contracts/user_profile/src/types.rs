use soroban_sdk::{contracttype, Address, Bytes, String};

/// Account type enumeration
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum AccountType {
    Tenant = 0,
    Landlord = 1,
    Agent = 2,
}

/// Attestation type enumeration for third-party verifications
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum AttestationType {
    KYC = 0,
    Landlord = 1,
    Employment = 2,
    CreditCheck = 3,
    BackgroundCheck = 4,
    Other = 5,
}

/// On-chain user profile structure (SEP-29 compliant)
/// Minimal data stored on-chain for gas efficiency
#[contracttype]
#[derive(Clone, Debug)]
pub struct UserProfile {
    /// Stellar account address
    pub account_id: Address,

    /// Data structure version for future upgrades
    pub version: String,

    /// User account type
    pub account_type: AccountType,

    /// Last update timestamp (Unix epoch)
    pub last_updated: u64,

    /// Hash of complete off-chain profile data (IPFS CID or SHA-256)
    pub data_hash: Bytes,

    /// KYC/verification status
    pub is_verified: bool,
}

impl UserProfile {
    /// Create a new profile
    pub fn new(
        account_id: Address,
        account_type: AccountType,
        data_hash: Bytes,
        timestamp: u64,
    ) -> Self {
        Self {
            account_id,
            version: String::from_str(&soroban_sdk::Env::default(), "1.0"),
            account_type,
            last_updated: timestamp,
            data_hash,
            is_verified: false,
        }
    }
}

/// Third-party attestation for user verification
#[contracttype]
#[derive(Clone, Debug)]
pub struct Attestation {
    /// Address of the issuer/attester
    pub issuer: Address,

    /// Type of attestation (KYC, Landlord endorsement, etc.)
    pub attestation_type: AttestationType,

    /// When the attestation was issued (Unix epoch)
    pub issued_at: u64,

    /// When the attestation expires (Unix epoch), 0 means no expiration
    pub expires_at: u64,

    /// Optional data hash for attestation details
    pub data_hash: Option<Bytes>,
}

impl Attestation {
    /// Check if attestation is still valid (not expired)
    pub fn is_active(&self, current_timestamp: u64) -> bool {
        self.expires_at == 0 || self.expires_at > current_timestamp
    }
}
