//! Generic arbitrable-case interface.
//!
//! Any external arbitration engine (e.g. the `dispute_resolution` contract) can route
//! a dispute through this escrow as long as it can resolve a `case_id` to a `Case` via
//! `get_case`. This decouples the escrow from any specific arbitration implementation:
//! the same shape is expected to be implemented by other registry contracts (freelance
//! milestones, trade-finance shipments, insurance claims, ...) so one arbitration engine
//! can serve all of them.
//!
//! Case IDs for escrow-backed cases are the lowercase hex encoding of the escrow's
//! internal 32-byte id, exactly as returned by `EscrowContract::create`.
use soroban_sdk::{contracttype, Address, BytesN, Env, String};

use crate::storage::EscrowStorage;
use crate::types::EscrowStatus;

/// Lifecycle status of a case, as reported to an external arbitration engine.
/// Variant names must match the arbitration engine's own `CaseStatus` exactly -
/// cross-contract calls decode enum variants by name, not by declaration order.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum CaseStatus {
    Draft,
    Pending,
    Active,
    Completed,
    Cancelled,
    Terminated,
    Disputed,
}

/// Generic arbitrable case. Field names must match the arbitration engine's own
/// `Case` struct exactly - cross-contract calls decode struct fields by name.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct Case {
    pub case_id: String,
    pub claimant: Address,
    pub respondent: Address,
    pub status: CaseStatus,
}

fn hex_nibble(c: u8) -> Option<u8> {
    match c {
        b'0'..=b'9' => Some(c - b'0'),
        b'a'..=b'f' => Some(c - b'a' + 10),
        b'A'..=b'F' => Some(c - b'A' + 10),
        _ => None,
    }
}

/// Decode a lowercase-hex `case_id` string back into the escrow's raw 32-byte id.
fn decode_escrow_id(env: &Env, case_id: &String) -> Option<BytesN<32>> {
    if case_id.len() != 64 {
        return None;
    }

    let mut hex_buf = [0u8; 64];
    case_id.copy_into_slice(&mut hex_buf);

    let mut bytes = [0u8; 32];
    for i in 0..32 {
        let hi = hex_nibble(hex_buf[i * 2])?;
        let lo = hex_nibble(hex_buf[i * 2 + 1])?;
        bytes[i] = (hi << 4) | lo;
    }

    Some(BytesN::from_array(env, &bytes))
}

fn map_status(status: &EscrowStatus) -> CaseStatus {
    match status {
        EscrowStatus::Pending => CaseStatus::Pending,
        EscrowStatus::Funded => CaseStatus::Active,
        EscrowStatus::Released => CaseStatus::Completed,
        EscrowStatus::Refunded => CaseStatus::Cancelled,
        EscrowStatus::Disputed => CaseStatus::Disputed,
    }
}

/// Fetch the generic case view of an escrow, for consumption by an external
/// arbitration engine. Returns `None` if `case_id` isn't a well-formed escrow id
/// or no escrow with that id exists.
pub fn get_case(env: &Env, case_id: String) -> Option<Case> {
    let escrow_id = decode_escrow_id(env, &case_id)?;
    let escrow = EscrowStorage::get(env, &escrow_id)?;

    Some(Case {
        case_id,
        claimant: escrow.depositor,
        respondent: escrow.beneficiary,
        status: map_status(&escrow.status),
    })
}
