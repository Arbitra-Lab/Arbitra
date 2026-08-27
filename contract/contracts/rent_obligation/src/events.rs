use soroban_sdk::{contractevent, Address, Env, String};

#[derive(Clone, Debug, Eq, PartialEq)]
pub enum BurnEvent {
    NFTBurned(String, Address, String),
}

/// Event emitted when a rent obligation NFT is minted
/// Topics: ["minted", landlord: Address]
#[contractevent(topics = ["minted"])]
pub struct ObligationMinted {
    #[topic]
    pub landlord: Address,
    pub agreement_id: String,
    pub minted_at: u64,
}

/// Event emitted when a rent obligation NFT is transferred
/// Topics: ["transferred", from: Address, to: Address]
#[contractevent(topics = ["transferred"])]
pub struct ObligationTransferred {
    #[topic]
    pub from: Address,
    #[topic]
    pub to: Address,
    pub agreement_id: String,
}

/// Event emitted when a rent obligation NFT is burned
/// Topics: ["burned", owner: Address]
#[contractevent(topics = ["burned"])]
pub struct NFTBurned {
    #[topic]
    pub owner: Address,
    pub token_id: String,
    pub reason: String,
}

/// Helper function to emit obligation minted event
pub(crate) fn obligation_minted(
    env: &Env,
    agreement_id: String,
    landlord: Address,
    minted_at: u64,
) {
    ObligationMinted {
        landlord,
        agreement_id,
        minted_at,
    }
    .publish(env);
}

/// Helper function to emit obligation transferred event
pub(crate) fn obligation_transferred(env: &Env, agreement_id: String, from: Address, to: Address) {
    ObligationTransferred {
        from,
        to,
        agreement_id,
    }
    .publish(env);
}

/// Helper function to emit NFT burned event
pub(crate) fn nft_burned(env: &Env, token_id: String, owner: Address, reason: String) {
    let _burn_event = BurnEvent::NFTBurned(token_id.clone(), owner.clone(), reason.clone());
    NFTBurned {
        owner,
        token_id,
        reason,
    }
    .publish(env);
}

/// Event emitted when a progressive late fee is assessed on a rent obligation
/// Topics: ["late_fee_applied", agreement_id: String]
#[contractevent(topics = ["late_fee_applied"])]
pub struct LateFeeApplied {
    #[topic]
    pub agreement_id: String,
    pub tier: u32,
    pub amount: i128,
    pub total_late_fees: i128,
}

/// Event emitted when a rent cycle is settled and late-fee state is reset
/// Topics: ["rent_cycle_settled", agreement_id: String]
#[contractevent(topics = ["rent_cycle_settled"])]
pub struct RentCycleSettled {
    #[topic]
    pub agreement_id: String,
    pub next_due_date: u64,
}

/// Helper function to emit late fee applied event
pub(crate) fn late_fee_applied(
    env: &Env,
    agreement_id: String,
    tier: u32,
    amount: i128,
    total_late_fees: i128,
) {
    LateFeeApplied {
        agreement_id,
        tier,
        amount,
        total_late_fees,
    }
    .publish(env);
}

/// Helper function to emit rent cycle settled event
pub(crate) fn rent_cycle_settled(env: &Env, agreement_id: String, next_due_date: u64) {
    RentCycleSettled {
        agreement_id,
        next_due_date,
    }
    .publish(env);
}
