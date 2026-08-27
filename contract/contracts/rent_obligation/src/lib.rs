#![no_std]
#![allow(clippy::too_many_arguments)]

use soroban_sdk::{contract, contractimpl, Address, Env, String, Vec};

mod errors;
mod events;
mod storage;
mod types;
mod upgrade;

#[cfg(test)]
mod tests;

pub use errors::ObligationError;
pub use storage::DataKey;
pub use types::{BurnRecord, LateFeeState, LateFeeTier, RentObligation, RentSchedule};

const SECONDS_PER_DAY: u64 = 86400;

#[contract]
pub struct TokenizedRentObligationContract;

#[contractimpl]
impl TokenizedRentObligationContract {
    fn validate_burn_reason(env: &Env, reason: &String) -> bool {
        reason == &String::from_str(env, "LeaseCompleted")
            || reason == &String::from_str(env, "AgreementTerminated")
            || reason == &String::from_str(env, "DisputeResolved")
            || reason == &String::from_str(env, "UserRequested")
    }

    /// Validate that a late-fee tier schedule is well-formed: non-empty,
    /// starting at 0 days overdue, strictly increasing thresholds, and
    /// non-decreasing (progressive) fee amounts.
    fn validate_late_fee_tiers(tiers: &Vec<types::LateFeeTier>) -> bool {
        if tiers.is_empty() {
            return false;
        }

        let mut prev_days: Option<u32> = None;
        let mut prev_fee: i128 = 0;

        for i in 0..tiers.len() {
            let tier = tiers.get(i).unwrap();

            if tier.fee_amount < 0 {
                return false;
            }

            match prev_days {
                None => {
                    if tier.min_days_overdue != 0 {
                        return false;
                    }
                }
                Some(prev) => {
                    if tier.min_days_overdue <= prev {
                        return false;
                    }
                    if tier.fee_amount < prev_fee {
                        return false;
                    }
                }
            }

            prev_days = Some(tier.min_days_overdue);
            prev_fee = tier.fee_amount;
        }

        true
    }

    /// Resolve the late-fee tier applicable at `now` against `schedule`.
    ///
    /// Returns `(0, 0)` if `now` is still within the due date + grace
    /// window. Otherwise returns the 1-based tier index and the fee amount
    /// for the highest tier whose `min_days_overdue` threshold has been
    /// reached, capped at `schedule.max_late_fee` (0 meaning uncapped).
    fn resolve_late_fee(schedule: &types::RentSchedule, now: u64) -> (u32, i128) {
        if now <= schedule.due_date {
            return (0, 0);
        }

        let seconds_late = now - schedule.due_date;
        if seconds_late <= schedule.grace_period_secs {
            return (0, 0);
        }

        let seconds_over_grace = seconds_late - schedule.grace_period_secs;
        let days_over_grace = (seconds_over_grace / SECONDS_PER_DAY) as u32;

        let mut tier_index: u32 = 0;
        let mut fee: i128 = 0;

        for i in 0..schedule.tiers.len() {
            let tier = schedule.tiers.get(i).unwrap();
            if tier.min_days_overdue > days_over_grace {
                break;
            }
            tier_index = i + 1;
            fee = tier.fee_amount;
        }

        if tier_index == 0 {
            return (0, 0);
        }

        if schedule.max_late_fee > 0 && fee > schedule.max_late_fee {
            fee = schedule.max_late_fee;
        }

        (tier_index, fee)
    }

    /// Initialize the contract.
    ///
    /// # Errors
    /// * `AlreadyInitialized` - If the contract has already been initialized
    pub fn initialize(env: Env) -> Result<(), ObligationError> {
        if env.storage().persistent().has(&DataKey::Initialized) {
            return Err(ObligationError::AlreadyInitialized);
        }

        env.storage().persistent().set(&DataKey::Initialized, &true);
        env.storage()
            .persistent()
            .extend_ttl(&DataKey::Initialized, 500000, 500000);

        env.storage()
            .persistent()
            .set(&DataKey::ObligationCount, &0u32);
        env.storage()
            .persistent()
            .extend_ttl(&DataKey::ObligationCount, 500000, 500000);

        Ok(())
    }

    /// Mint a new tokenized rent obligation NFT for a rent agreement.
    ///
    /// # Arguments
    /// * `agreement_id` - Unique identifier for the rent agreement
    /// * `landlord` - Address of the landlord who will receive the NFT
    ///
    /// # Errors
    /// * `NotInitialized` - If contract hasn't been initialized
    /// * `ObligationAlreadyExists` - If an obligation for this agreement already exists
    pub fn mint_obligation(
        env: Env,
        agreement_id: String,
        landlord: Address,
    ) -> Result<(), ObligationError> {
        if !env.storage().persistent().has(&DataKey::Initialized) {
            return Err(ObligationError::NotInitialized);
        }

        landlord.require_auth();

        let obligation_key = DataKey::Obligation(agreement_id.clone());
        let owner_key = DataKey::Owner(agreement_id.clone());

        if env.storage().persistent().has(&obligation_key) {
            return Err(ObligationError::ObligationAlreadyExists);
        }

        let obligation = RentObligation {
            agreement_id: agreement_id.clone(),
            owner: landlord.clone(),
            minted_at: env.ledger().timestamp(),
        };

        env.storage().persistent().set(&obligation_key, &obligation);
        env.storage()
            .persistent()
            .extend_ttl(&obligation_key, 500000, 500000);

        env.storage().persistent().set(&owner_key, &landlord);
        env.storage()
            .persistent()
            .extend_ttl(&owner_key, 500000, 500000);

        let mut count: u32 = env
            .storage()
            .persistent()
            .get(&DataKey::ObligationCount)
            .unwrap_or(0);
        count += 1;
        env.storage()
            .persistent()
            .set(&DataKey::ObligationCount, &count);
        env.storage()
            .persistent()
            .extend_ttl(&DataKey::ObligationCount, 500000, 500000);

        events::obligation_minted(&env, agreement_id, landlord, obligation.minted_at);

        Ok(())
    }

    /// Transfer ownership of a tokenized rent obligation to another address.
    ///
    /// # Arguments
    /// * `from` - Current owner of the obligation
    /// * `to` - New owner to transfer to
    /// * `agreement_id` - Agreement identifier for the obligation
    ///
    /// # Errors
    /// * `NotInitialized` - If contract hasn't been initialized
    /// * `ObligationNotFound` - If the obligation doesn't exist
    /// * `Unauthorized` - If the caller is not the current owner
    pub fn transfer_obligation(
        env: Env,
        from: Address,
        to: Address,
        agreement_id: String,
    ) -> Result<(), ObligationError> {
        if !env.storage().persistent().has(&DataKey::Initialized) {
            return Err(ObligationError::NotInitialized);
        }

        from.require_auth();

        let obligation_key = DataKey::Obligation(agreement_id.clone());
        let owner_key = DataKey::Owner(agreement_id.clone());

        let mut obligation: RentObligation = env
            .storage()
            .persistent()
            .get(&obligation_key)
            .ok_or(ObligationError::ObligationNotFound)?;

        if obligation.owner != from {
            return Err(ObligationError::Unauthorized);
        }

        obligation.owner = to.clone();

        env.storage().persistent().set(&obligation_key, &obligation);
        env.storage()
            .persistent()
            .extend_ttl(&obligation_key, 500000, 500000);

        env.storage().persistent().set(&owner_key, &to);
        env.storage()
            .persistent()
            .extend_ttl(&owner_key, 500000, 500000);

        events::obligation_transferred(&env, agreement_id, from, to);

        Ok(())
    }

    /// Get the current owner of a tokenized rent obligation.
    ///
    /// # Arguments
    /// * `agreement_id` - Agreement identifier for the obligation
    ///
    /// # Returns
    /// The address of the current owner, or None if the obligation doesn't exist
    pub fn get_obligation_owner(env: Env, agreement_id: String) -> Option<Address> {
        let owner_key = DataKey::Owner(agreement_id);
        env.storage().persistent().get(&owner_key)
    }

    /// Get the full obligation data for an agreement.
    ///
    /// # Arguments
    /// * `agreement_id` - Agreement identifier for the obligation
    ///
    /// # Returns
    /// The RentObligation data, or None if the obligation doesn't exist
    pub fn get_obligation(env: Env, agreement_id: String) -> Option<RentObligation> {
        let obligation_key = DataKey::Obligation(agreement_id);
        env.storage().persistent().get(&obligation_key)
    }

    /// Check if an obligation exists for a given agreement.
    ///
    /// # Arguments
    /// * `agreement_id` - Agreement identifier to check
    ///
    /// # Returns
    /// True if the obligation exists, false otherwise
    pub fn has_obligation(env: Env, agreement_id: String) -> bool {
        let obligation_key = DataKey::Obligation(agreement_id);
        env.storage().persistent().has(&obligation_key)
    }

    /// Get the total count of minted obligations.
    ///
    /// # Returns
    /// The total number of obligations that have been minted
    pub fn get_obligation_count(env: Env) -> u32 {
        env.storage()
            .persistent()
            .get(&DataKey::ObligationCount)
            .unwrap_or(0)
    }

    /// Burn a tokenized rent obligation NFT.
    ///
    /// # Arguments
    /// * `token_id` - Agreement identifier for the NFT to burn
    /// * `reason` - Reason for burning the NFT
    ///
    /// # Errors
    /// * `NotInitialized` - If contract hasn't been initialized
    /// * `ObligationNotFound` - If the obligation doesn't exist
    /// * `AlreadyBurned` - If the NFT has already been burned
    /// * `Unauthorized` - If the caller is not the owner
    pub fn burn_nft(env: Env, token_id: String, reason: String) -> Result<(), ObligationError> {
        if !env.storage().persistent().has(&DataKey::Initialized) {
            return Err(ObligationError::NotInitialized);
        }

        if reason.is_empty() || !Self::validate_burn_reason(&env, &reason) {
            return Err(ObligationError::InvalidBurnReason);
        }

        let obligation_key = DataKey::Obligation(token_id.clone());
        let owner_key = DataKey::Owner(token_id.clone());
        let burn_record_key = DataKey::BurnRecord(token_id.clone());

        if env.storage().persistent().has(&burn_record_key) {
            return Err(ObligationError::AlreadyBurned);
        }

        let obligation: RentObligation = env
            .storage()
            .persistent()
            .get(&obligation_key)
            .ok_or(ObligationError::ObligationNotFound)?;

        if env.ledger().timestamp() <= obligation.minted_at {
            return Err(ObligationError::CannotBurnActiveObligation);
        }

        obligation.owner.require_auth();

        let burn_record = BurnRecord {
            token_id: token_id.clone(),
            burned_by: obligation.owner.clone(),
            burned_at: env.ledger().timestamp(),
            reason,
        };

        env.storage()
            .persistent()
            .set(&burn_record_key, &burn_record);
        env.storage()
            .persistent()
            .extend_ttl(&burn_record_key, 500000, 500000);

        let burned_nfts_key = DataKey::BurnedNfts(obligation.owner.to_string());
        let mut burned_nfts: Vec<String> = env
            .storage()
            .persistent()
            .get(&burned_nfts_key)
            .unwrap_or_else(|| Vec::new(&env));
        burned_nfts.push_back(token_id.clone());
        env.storage()
            .persistent()
            .set(&burned_nfts_key, &burned_nfts);
        env.storage()
            .persistent()
            .extend_ttl(&burned_nfts_key, 500000, 500000);

        env.storage().persistent().remove(&obligation_key);
        env.storage().persistent().remove(&owner_key);

        let mut count: u32 = env
            .storage()
            .persistent()
            .get(&DataKey::ObligationCount)
            .unwrap_or(0);
        count = count.saturating_sub(1);
        env.storage()
            .persistent()
            .set(&DataKey::ObligationCount, &count);
        env.storage()
            .persistent()
            .extend_ttl(&DataKey::ObligationCount, 500000, 500000);

        events::nft_burned(&env, token_id, obligation.owner, burn_record.reason);

        Ok(())
    }

    /// Check if an NFT can be burned.
    ///
    /// # Arguments
    /// * `token_id` - Agreement identifier for the NFT
    ///
    /// # Errors
    /// * `NotInitialized` - If contract hasn't been initialized
    /// * `ObligationNotFound` - If the obligation doesn't exist
    /// * `AlreadyBurned` - If the NFT has already been burned
    pub fn can_burn(env: Env, token_id: String) -> Result<bool, ObligationError> {
        if !env.storage().persistent().has(&DataKey::Initialized) {
            return Err(ObligationError::NotInitialized);
        }

        let obligation_key = DataKey::Obligation(token_id.clone());
        let burn_record_key = DataKey::BurnRecord(token_id.clone());

        if env.storage().persistent().has(&burn_record_key) {
            return Err(ObligationError::AlreadyBurned);
        }

        if !env.storage().persistent().has(&obligation_key) {
            return Err(ObligationError::ObligationNotFound);
        }

        let obligation: RentObligation = env
            .storage()
            .persistent()
            .get(&obligation_key)
            .ok_or(ObligationError::ObligationNotFound)?;

        if env.ledger().timestamp() <= obligation.minted_at {
            return Err(ObligationError::CannotBurnActiveObligation);
        }

        Ok(true)
    }

    /// Get the burn record for a burned NFT.
    ///
    /// # Arguments
    /// * `token_id` - Agreement identifier for the burned NFT
    ///
    /// # Errors
    /// * `BurnRecordNotFound` - If the NFT hasn't been burned
    pub fn get_burn_record(env: Env, token_id: String) -> Result<BurnRecord, ObligationError> {
        let burn_record_key = DataKey::BurnRecord(token_id);
        env.storage()
            .persistent()
            .get(&burn_record_key)
            .ok_or(ObligationError::BurnRecordNotFound)
    }

    /// Get all burned NFTs for an owner.
    ///
    /// # Arguments
    /// * `owner` - Address of the owner to query burned NFTs
    ///
    /// # Returns
    /// A vector of burned token IDs
    pub fn get_burned_nfts(env: Env, owner: Address) -> Result<Vec<String>, ObligationError> {
        if !env.storage().persistent().has(&DataKey::Initialized) {
            return Err(ObligationError::NotInitialized);
        }

        let owner_key = DataKey::BurnedNfts(owner.to_string());
        Ok(env
            .storage()
            .persistent()
            .get(&owner_key)
            .unwrap_or_else(|| Vec::new(&env)))
    }

    // --- Rent Schedule / Late Fee Functions ---

    /// Configure (or reconfigure) the rent schedule and progressive late-fee
    /// tiers for an obligation. Only the current obligation owner may call
    /// this.
    ///
    /// # Arguments
    /// * `agreement_id` - Agreement identifier for the obligation
    /// * `rent_amount` - Rent amount due each cycle
    /// * `due_date` - Timestamp the current cycle's rent is due
    /// * `period_secs` - Length of a rent cycle, used to advance `due_date` on settlement
    /// * `grace_period_secs` - Grace window after `due_date` before any late fee applies
    /// * `tiers` - Progressive late-fee tiers, ascending from `min_days_overdue == 0`
    /// * `max_late_fee` - Cap on the late fee chargeable per cycle (0 = uncapped)
    ///
    /// # Errors
    /// * `NotInitialized` - If contract hasn't been initialized
    /// * `ObligationNotFound` - If the obligation doesn't exist
    /// * `Unauthorized` - If the caller is not the current owner
    /// * `InvalidRentSchedule` - If the rent amount, period, or tiers are invalid
    pub fn configure_rent_schedule(
        env: Env,
        landlord: Address,
        agreement_id: String,
        rent_amount: i128,
        due_date: u64,
        period_secs: u64,
        grace_period_secs: u64,
        tiers: Vec<types::LateFeeTier>,
        max_late_fee: i128,
    ) -> Result<(), ObligationError> {
        if !env.storage().persistent().has(&DataKey::Initialized) {
            return Err(ObligationError::NotInitialized);
        }

        landlord.require_auth();

        let obligation_key = DataKey::Obligation(agreement_id.clone());
        let obligation: RentObligation = env
            .storage()
            .persistent()
            .get(&obligation_key)
            .ok_or(ObligationError::ObligationNotFound)?;

        if obligation.owner != landlord {
            return Err(ObligationError::Unauthorized);
        }

        if rent_amount <= 0 || period_secs == 0 || max_late_fee < 0 {
            return Err(ObligationError::InvalidRentSchedule);
        }

        if !Self::validate_late_fee_tiers(&tiers) {
            return Err(ObligationError::InvalidRentSchedule);
        }

        let schedule = types::RentSchedule {
            rent_amount,
            due_date,
            period_secs,
            grace_period_secs,
            tiers,
            max_late_fee,
        };

        let schedule_key = DataKey::RentSchedule(agreement_id.clone());
        env.storage().persistent().set(&schedule_key, &schedule);
        env.storage()
            .persistent()
            .extend_ttl(&schedule_key, 500000, 500000);

        let state_key = DataKey::LateFeeState(agreement_id);
        let state = types::LateFeeState {
            total_late_fees: 0,
            last_tier: 0,
        };
        env.storage().persistent().set(&state_key, &state);
        env.storage()
            .persistent()
            .extend_ttl(&state_key, 500000, 500000);

        Ok(())
    }

    /// Get the configured rent schedule for an agreement.
    pub fn get_rent_schedule(env: Env, agreement_id: String) -> Option<types::RentSchedule> {
        env.storage()
            .persistent()
            .get(&DataKey::RentSchedule(agreement_id))
    }

    /// Get the current late-fee state for an agreement's active cycle.
    pub fn get_late_fee_state(env: Env, agreement_id: String) -> Option<types::LateFeeState> {
        env.storage()
            .persistent()
            .get(&DataKey::LateFeeState(agreement_id))
    }

    /// Assess the late fee (if any) for a rent payment made "now", against
    /// the agreement's configured schedule. Emits `late_fee_applied` when a
    /// tier is crossed. Returns the late fee amount charged for this cycle
    /// (0 if the payment is within the grace period).
    ///
    /// # Errors
    /// * `NotInitialized` - If contract hasn't been initialized
    /// * `ObligationNotFound` - If the obligation doesn't exist
    /// * `Unauthorized` - If the caller is not the current owner
    /// * `RentScheduleNotFound` - If no rent schedule has been configured
    pub fn record_payment(env: Env, agreement_id: String) -> Result<i128, ObligationError> {
        if !env.storage().persistent().has(&DataKey::Initialized) {
            return Err(ObligationError::NotInitialized);
        }

        let obligation_key = DataKey::Obligation(agreement_id.clone());
        let obligation: RentObligation = env
            .storage()
            .persistent()
            .get(&obligation_key)
            .ok_or(ObligationError::ObligationNotFound)?;

        obligation.owner.require_auth();

        let schedule_key = DataKey::RentSchedule(agreement_id.clone());
        let schedule: types::RentSchedule = env
            .storage()
            .persistent()
            .get(&schedule_key)
            .ok_or(ObligationError::RentScheduleNotFound)?;

        let now = env.ledger().timestamp();
        let (tier, amount) = Self::resolve_late_fee(&schedule, now);

        let state_key = DataKey::LateFeeState(agreement_id.clone());
        let state = types::LateFeeState {
            total_late_fees: amount,
            last_tier: tier,
        };
        env.storage().persistent().set(&state_key, &state);
        env.storage()
            .persistent()
            .extend_ttl(&state_key, 500000, 500000);

        if tier > 0 {
            events::late_fee_applied(&env, agreement_id, tier, amount, amount);
        }

        Ok(amount)
    }

    /// Settle the obligation's current rent cycle: clears any assessed late
    /// fees and advances the due date by one `period_secs` for the next
    /// cycle. Only the current obligation owner may call this.
    ///
    /// # Errors
    /// * `NotInitialized` - If contract hasn't been initialized
    /// * `ObligationNotFound` - If the obligation doesn't exist
    /// * `Unauthorized` - If the caller is not the current owner
    /// * `RentScheduleNotFound` - If no rent schedule has been configured
    pub fn settle_obligation(env: Env, agreement_id: String) -> Result<(), ObligationError> {
        if !env.storage().persistent().has(&DataKey::Initialized) {
            return Err(ObligationError::NotInitialized);
        }

        let obligation_key = DataKey::Obligation(agreement_id.clone());
        let obligation: RentObligation = env
            .storage()
            .persistent()
            .get(&obligation_key)
            .ok_or(ObligationError::ObligationNotFound)?;

        obligation.owner.require_auth();

        let schedule_key = DataKey::RentSchedule(agreement_id.clone());
        let mut schedule: types::RentSchedule = env
            .storage()
            .persistent()
            .get(&schedule_key)
            .ok_or(ObligationError::RentScheduleNotFound)?;

        schedule.due_date = schedule.due_date.saturating_add(schedule.period_secs);
        env.storage().persistent().set(&schedule_key, &schedule);
        env.storage()
            .persistent()
            .extend_ttl(&schedule_key, 500000, 500000);

        let state_key = DataKey::LateFeeState(agreement_id.clone());
        let state = types::LateFeeState {
            total_late_fees: 0,
            last_tier: 0,
        };
        env.storage().persistent().set(&state_key, &state);
        env.storage()
            .persistent()
            .extend_ttl(&state_key, 500000, 500000);

        events::rent_cycle_settled(&env, agreement_id, schedule.due_date);

        Ok(())
    }

    // --- Upgrade Functions ---

    /// Propose a contract upgrade.
    pub fn propose_upgrade(
        env: Env,
        proposer: Address,
        proposal_id: String,
        wasm_hash: soroban_sdk::Bytes,
        notes: String,
        delay_seconds: u64,
    ) -> Result<(), ObligationError> {
        upgrade::propose_upgrade(&env, proposer, proposal_id, wasm_hash, notes, delay_seconds)
    }

    /// Approve an upgrade proposal.
    pub fn approve_upgrade(
        env: Env,
        approver: Address,
        proposal_id: String,
    ) -> Result<(), ObligationError> {
        upgrade::approve_upgrade(&env, approver, proposal_id)
    }

    /// Execute an approved upgrade.
    pub fn execute_upgrade(
        env: Env,
        executor: Address,
        proposal_id: String,
    ) -> Result<(), ObligationError> {
        upgrade::execute_upgrade(&env, executor, proposal_id)
    }

    /// Get an upgrade proposal.
    pub fn get_upgrade_proposal(
        env: Env,
        proposal_id: String,
    ) -> Result<upgrade::UpgradeProposal, ObligationError> {
        upgrade::get_upgrade_proposal(&env, proposal_id)
    }
}
