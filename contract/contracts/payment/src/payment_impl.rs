//! Payment processing implementation.
use soroban_sdk::{Address, Env, String, Vec};

use crate::errors::PaymentError;
use crate::storage::DataKey;
use crate::types::{
    AgreementStatus, EscalationType, FeeSplitConfig, FeeSplitRecord, FeeSplitRecipient,
    PaymentRecord, RentAgreement, RentEscalationConfig,
};
use crate::upgrade;

/// Calculate the rent amount for a specific period (payment number) with escalation
pub fn calculate_rent_for_period(
    base_rent: i128,
    payment_number: u32,
    config: &RentEscalationConfig,
) -> i128 {
    match config.escalation_type {
        EscalationType::None => base_rent,
        EscalationType::FixedAnnual => {
            if config.payments_per_year == 0 {
                return base_rent;
            }

            // Calculate how many years have passed since the first payment
            // payment_number is 1-indexed (1st payment, 2nd payment, etc.)
            let years_passed = (payment_number - 1) / config.payments_per_year;

            if years_passed == 0 {
                return base_rent;
            }

            // Calculate escalated rent: Rent = BaseRent * (1 + rate)^years
            let mut current_rent = base_rent;
            for _ in 0..years_passed {
                // annual_rate_bps is in basis points (1 bps = 0.01%)
                let increase = (current_rent * (config.annual_rate_bps as i128)) / 10000;
                current_rent += increase;
            }
            current_rent
        }
    }
}

/// Create an immutable payment record
pub fn create_payment_record(
    _env: &Env,
    agreement_id: &String,
    amount: i128,
    landlord_amount: i128,
    agent_amount: i128,
    tenant: &Address,
    payment_number: u32,
    timestamp: u64,
) -> Result<PaymentRecord, PaymentError> {
    Ok(PaymentRecord {
        agreement_id: agreement_id.clone(),
        payment_number,
        amount,
        landlord_amount,
        agent_amount,
        timestamp,
        tenant: tenant.clone(),
    })
}

/// Calculate payment split between landlord and agent
pub fn calculate_payment_split(amount: &i128, commission_rate: &u32) -> (i128, i128) {
    // commission_rate is in basis points (1 basis point = 0.01%)
    let agent_amount = (amount * (*commission_rate as i128)) / 10000;
    let landlord_amount = amount - agent_amount;
    (landlord_amount, agent_amount)
}

/// Process rent payment with automatic commission splitting
/// This is the alternate implementation used by RentalContract
#[allow(deprecated)]
#[allow(dead_code)]
pub fn pay_rent_with_agent(
    env: Env,
    agreement_id: String,
    token: Address,
    amount: i128,
) -> Result<(), PaymentError> {
    use soroban_sdk::token::Client as TokenClient;

    // Load agreement
    let mut agreement: RentAgreement = env
        .storage()
        .persistent()
        .get(&DataKey::Agreement(agreement_id.clone()))
        .ok_or(PaymentError::InvalidAmount)?;

    // Validate agreement is active
    if agreement.status != AgreementStatus::Active {
        return Err(PaymentError::AgreementNotActive);
    }

    // Validate amount is strictly positive to prevent logical errors
    if amount <= 0 {
        return Err(PaymentError::InvalidAmount);
    }

    // Validate amount matches monthly rent exactly
    if amount != agreement.monthly_rent {
        return Err(PaymentError::InvalidAmount);
    }

    // Authorize tenant
    agreement.tenant.require_auth();

    // Calculate payment split
    let (landlord_amount, agent_amount) =
        calculate_payment_split(&amount, &agreement.agent_commission_rate);

    // Execute atomic token transfers
    let token_client = TokenClient::new(&env, &token);

    // Transfer to landlord
    token_client.transfer(&agreement.tenant, &agreement.landlord, &landlord_amount);

    // Transfer to agent if present
    if let Some(agent_address) = &agreement.agent {
        if agent_amount > 0 {
            token_client.transfer(&agreement.tenant, agent_address, &agent_amount);
        }
    }

    // Create payment record
    let timestamp = env.ledger().timestamp();
    let payment_record = create_payment_record(
        &env,
        &agreement_id,
        amount,
        landlord_amount,
        agent_amount,
        &agreement.tenant,
        agreement.payment_count + 1,
        timestamp,
    )?;

    // Update agreement totals
    agreement.total_rent_paid += amount;
    agreement.payment_count += 1;

    // Persist updated agreement
    env.storage()
        .persistent()
        .set(&DataKey::Agreement(agreement_id.clone()), &agreement);

    // Persist payment record
    env.storage().persistent().set(
        &DataKey::PaymentRecord(agreement_id.clone(), agreement.payment_count),
        &payment_record,
    );

    // Emit event
    env.events().publish(
        (String::from_str(&env, "rent_paid"), agreement_id),
        (amount, landlord_amount, agent_amount, timestamp),
    );

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
) -> Result<(), PaymentError> {
    upgrade::propose_upgrade(&env, proposer, proposal_id, wasm_hash, notes, delay_seconds)
}

/// Approve an upgrade proposal.
pub fn approve_upgrade(
    env: Env,
    approver: Address,
    proposal_id: String,
) -> Result<(), PaymentError> {
    upgrade::approve_upgrade(&env, approver, proposal_id)
}

/// Execute an approved upgrade.
pub fn execute_upgrade(
    env: Env,
    executor: Address,
    proposal_id: String,
) -> Result<(), PaymentError> {
    upgrade::execute_upgrade(&env, executor, proposal_id)
}

/// Get an upgrade proposal.
pub fn get_upgrade_proposal(
    env: Env,
    proposal_id: String,
) -> Result<upgrade::UpgradeProposal, PaymentError> {
    upgrade::get_upgrade_proposal(&env, proposal_id)
}

// --- Fee Split Configuration Functions ---

/// Validate a fee split configuration
/// - Recipients list is not empty
/// - No more than 10 recipients
/// - No duplicate recipients
/// - All basis points are <= 10000
/// - Total basis points equals exactly 10000 (100%)
pub fn validate_fee_split_config(recipients: &Vec<FeeSplitRecipient>) -> Result<(), PaymentError> {
    // Check not empty
    if recipients.is_empty() {
        return Err(PaymentError::EmptyFeeSplitRecipients);
    }

    // Check maximum recipients (10)
    if recipients.len() > 10 {
        return Err(PaymentError::TooManyFeeSplitRecipients);
    }

    let mut total_bps: u32 = 0;
    let mut seen_addresses: Vec<Address> = Vec::new();

    for recipient in recipients.iter() {
        // Check basis points are valid (0-10000)
        if recipient.basis_points > 10000 {
            return Err(PaymentError::InvalidRecipientBasisPoints);
        }

        // Check for duplicates
        for seen in seen_addresses.iter() {
            if seen == &recipient.address {
                return Err(PaymentError::DuplicateFeeSplitRecipient);
            }
        }
        seen_addresses.push_back(recipient.address.clone());

        // Sum basis points, checking for overflow
        total_bps = total_bps.checked_add(recipient.basis_points)
            .ok_or(PaymentError::InvalidFeeSplitTotal)?;
    }

    // Check that total equals 10000 (100%)
    if total_bps != 10000 {
        return Err(PaymentError::InvalidFeeSplitTotal);
    }

    Ok(())
}

/// Set or update a fee split configuration for an agreement
pub fn set_fee_split_config(
    env: Env,
    config_id: String,
    agreement_id: String,
    recipients: Vec<FeeSplitRecipient>,
) -> Result<(), PaymentError> {
    // Validate the configuration
    validate_fee_split_config(&recipients)?;

    let timestamp = env.ledger().timestamp();

    let config = FeeSplitConfig {
        config_id: config_id.clone(),
        agreement_id: agreement_id.clone(),
        recipients: recipients.clone(),
        created_at: timestamp,
        active: true,
    };

    // Store the fee split configuration
    env.storage()
        .persistent()
        .set(&DataKey::FeeSplitConfig(config_id.clone()), &config);

    // Store as the current active split for this agreement
    env.storage()
        .persistent()
        .set(&DataKey::AgreementFeeSplit(agreement_id.clone()), &config);

    // Emit event
    crate::events::fee_split_config_set(&env, config_id, agreement_id, recipients.len() as u32);

    Ok(())
}

/// Get the active fee split configuration for an agreement
pub fn get_fee_split_config(env: &Env, agreement_id: &String) -> Result<FeeSplitConfig, PaymentError> {
    env.storage()
        .persistent()
        .get(&DataKey::AgreementFeeSplit(agreement_id.clone()))
        .ok_or(PaymentError::FeeSplitConfigNotFound)
}

/// Calculate fee splits for a given amount based on configuration
/// Returns a vector of (recipient_address, amount) tuples
/// Handles rounding by assigning remainder to the last recipient
pub fn calculate_fee_splits(
    amount: &i128,
    recipients: &Vec<FeeSplitRecipient>,
) -> Vec<(Address, i128)> {
    let mut splits: Vec<(Address, i128)> = Vec::new();
    let mut remaining_amount = *amount;

    for (index, recipient) in recipients.iter().enumerate() {
        let is_last = index == recipients.len() - 1;

        let recipient_amount = if is_last {
            // Assign remainder to last recipient to ensure exact distribution
            remaining_amount
        } else {
            // Calculate: amount * basis_points / 10000
            let calculated = (amount * (recipient.basis_points as i128)) / 10000;
            remaining_amount -= calculated;
            calculated
        };

        splits.push_back((recipient.address.clone(), recipient_amount));
    }

    splits
}

/// Execute atomic fee split payment distribution
/// Transfers funds from payer to all recipients according to the split configuration
pub fn execute_fee_split_payment(
    env: Env,
    agreement_id: String,
    token: Address,
    total_amount: i128,
    payer: Address,
    payment_number: u32,
) -> Result<(), PaymentError> {
    use soroban_sdk::token::Client as TokenClient;

    // Get the active fee split configuration
    let config = get_fee_split_config(&env, &agreement_id)?;

    // Validate amount is strictly positive
    if total_amount <= 0 {
        return Err(PaymentError::InvalidAmount);
    }

    // Calculate the splits
    let splits = calculate_fee_splits(&total_amount, &config.recipients);

    // Execute atomic token transfers
    let token_client = TokenClient::new(&env, &token);

    // Transfer to each recipient
    for (recipient, amount) in splits.iter() {
        if *amount > 0 {
            token_client.transfer(&payer, recipient, amount);

            // Create and store fee split record
            let record = FeeSplitRecord {
                config_id: config.config_id.clone(),
                agreement_id: agreement_id.clone(),
                recipient: recipient.clone(),
                basis_points: {
                    // Find the corresponding basis points from config
                    let mut bps = 0;
                    for rec in config.recipients.iter() {
                        if rec.address == *recipient {
                            bps = rec.basis_points;
                            break;
                        }
                    }
                    bps
                },
                amount: *amount,
                timestamp: env.ledger().timestamp(),
                payment_number,
            };

            env.storage()
                .persistent()
                .set(&DataKey::FeeSplitRecord(agreement_id.clone(), payment_number), &record);

            // Emit fee split executed event
            crate::events::fee_split_executed(
                &env,
                config.config_id.clone(),
                agreement_id.clone(),
                recipient.clone(),
                *amount,
                record.basis_points,
                payment_number,
            );
        }
    }

    Ok(())
}
