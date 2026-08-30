use crate::types::{AccountType, AttestationType};
use soroban_sdk::{contractevent, Address, Bytes, Env};

#[contractevent(topics = ["profile", "created"])]
pub struct ProfileCreated {
    #[topic]
    pub account_id: Address,
    pub account_type: AccountType,
    pub data_hash: Bytes,
}

#[contractevent(topics = ["profile", "updated"])]
pub struct ProfileUpdated {
    #[topic]
    pub account_id: Address,
    pub account_type: AccountType,
    pub data_hash: Bytes,
}

#[contractevent(topics = ["profile", "verified"])]
pub struct ProfileVerified {
    #[topic]
    pub account_id: Address,
}

#[contractevent(topics = ["profile", "unverified"])]
pub struct ProfileUnverified {
    #[topic]
    pub account_id: Address,
}

#[contractevent(topics = ["profile", "deleted"])]
pub struct ProfileDeleted {
    #[topic]
    pub account_id: Address,
}

#[contractevent(topics = ["init"])]
pub struct Initialized {
    #[topic]
    pub admin: Address,
}

/// Profile created event
pub fn profile_created(
    env: &Env,
    account_id: Address,
    account_type: AccountType,
    data_hash: Bytes,
) {
    ProfileCreated {
        account_id,
        account_type,
        data_hash,
    }
    .publish(env);
}

/// Profile updated event
pub fn profile_updated(
    env: &Env,
    account_id: Address,
    account_type: AccountType,
    data_hash: Bytes,
) {
    ProfileUpdated {
        account_id,
        account_type,
        data_hash,
    }
    .publish(env);
}

/// Profile verified event
pub fn profile_verified(env: &Env, account_id: Address) {
    ProfileVerified { account_id }.publish(env);
}

/// Profile unverified event
pub fn profile_unverified(env: &Env, account_id: Address) {
    ProfileUnverified { account_id }.publish(env);
}

/// Profile deleted event
pub fn profile_deleted(env: &Env, account_id: Address) {
    ProfileDeleted { account_id }.publish(env);
}

/// Contract initialized event
pub fn initialized(env: &Env, admin: Address) {
    Initialized { admin }.publish(env);
}

#[contractevent(topics = ["attestation", "added"])]
pub struct AttestationAdded {
    #[topic]
    pub account_id: Address,
    #[topic]
    pub issuer: Address,
    pub attestation_type: AttestationType,
    pub issued_at: u64,
    pub expires_at: u64,
}

#[contractevent(topics = ["attestation", "revoked"])]
pub struct AttestationRevoked {
    #[topic]
    pub account_id: Address,
    #[topic]
    pub issuer: Address,
    pub attestation_type: AttestationType,
}

/// Attestation added event
pub fn attestation_added(
    env: &Env,
    account_id: Address,
    issuer: Address,
    attestation_type: AttestationType,
    issued_at: u64,
    expires_at: u64,
) {
    AttestationAdded {
        account_id,
        issuer,
        attestation_type,
        issued_at,
        expires_at,
    }
    .publish(env);
}

/// Attestation revoked event
pub fn attestation_revoked(
    env: &Env,
    account_id: Address,
    issuer: Address,
    attestation_type: AttestationType,
) {
    AttestationRevoked {
        account_id,
        issuer,
        attestation_type,
    }
    .publish(env);
}
