use crate::storage::DataKey;
use crate::types::ErrorContext;
use soroban_sdk::{contracterror, Env, String, Vec};

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq)]
#[repr(u32)]
pub enum AgreementError {
    // Already existed
    AlreadyInitialized = 1,
    InvalidAdmin = 2,
    InvalidConfig = 3,
    AgreementAlreadyExists = 4,
    InvalidAmount = 5,
    InvalidDate = 6,
    InvalidCommissionRate = 7,
    AgreementNotActive = 10,
    AgreementNotFound = 13,
    NotTenant = 14,
    Unauthorized = 18,
    InvalidState = 15,
    Expired = 16,
    ContractPaused = 17,
    TokenNotSupported = 19,
    RateNotFound = 20,
    ConversionError = 21,
    InsufficientPayment = 22,
    AlreadyPaused = 23,
    NotPaused = 24,

    // Payment errors
    PaymentInsufficientFunds = 201,
    PaymentAlreadyProcessed = 202,
    PaymentFailed = 203,
    PaymentInvalidAmount = 204,

    // Timelock errors (reusing range 301-304, replacing unused dispute codes)
    TimelockNotFound = 301,
    TimelockAlreadyExecuted = 302,
    TimelockAlreadyCancelled = 303,
    TimelockEtaNotReached = 304,

    // Escrow errors
    EscrowNotFound = 401,
    EscrowAlreadyReleased = 402,
    EscrowInsufficientFunds = 403,
    EscrowTimeoutNotReached = 404,

    // Authorization & State
    InsufficientPermissions = 501,
    AdminOnly = 502,
    InvalidTransition = 601,
    InvalidInput = 701,
    InvalidAddress = 702,

    // Rate limiting & Generic
    RateLimitExceeded = 801,
    CooldownNotMet = 802,
    InternalError = 901,
    TimelockDelayTooShort = 902,

    // Multi-sig errors (using range 1100-1105 only)
    MultiSigNotInitialized = 1100,
    ProposalNotFound = 1101,
    ProposalAlreadyExecuted = 1102,
    ProposalExpired = 1103,
    InsufficientApprovals = 1104,
    AlreadyApproved = 1105,
}

impl AgreementError {
    pub fn message(&self, env: &Env) -> String {
        let msg = match self {
            AgreementError::AlreadyInitialized => "Contract already initialized.",
            AgreementError::InvalidAdmin => "Invalid admin address provided.",
            AgreementError::InvalidConfig => "Invalid configuration parameter.",
            AgreementError::AgreementAlreadyExists => "Agreement already exists for the given ID.",
            AgreementError::InvalidAmount => "Invalid amount provided for the operation.",
            AgreementError::InvalidDate => "Invalid date or timestamp range.",
            AgreementError::InvalidCommissionRate => {
                "Commission rate must be between 0 and 10000 bps."
            }
            AgreementError::AgreementNotActive => "Agreement is not in an Active state.",
            AgreementError::AgreementNotFound => "Agreement not found. Please check the ID.",
            AgreementError::NotTenant => "The caller is not the tenant of this agreement.",
            AgreementError::Unauthorized => "You are not authorized to perform this action.",
            AgreementError::InvalidState => {
                "Contract or agreement state is invalid for this operation."
            }
            AgreementError::Expired => "The agreement or operation has expired.",
            AgreementError::ContractPaused => "Operations are currently paused by the administrator.",
            AgreementError::TokenNotSupported => "The specified payment token is not supported.",
            AgreementError::RateNotFound => "Exchange rate for the given token pair not found.",
            AgreementError::ConversionError => {
                "Error occurred while converting amounts between tokens."
            }
            AgreementError::InsufficientPayment => {
                "Provided payment is insufficient for the required amount."
            }
            AgreementError::AlreadyPaused => "The contract is already in a paused state.",
            AgreementError::NotPaused => "The contract is not currently paused.",

            AgreementError::PaymentInsufficientFunds => {
                "Insufficient funds. Please ensure you have enough balance."
            }
            AgreementError::PaymentAlreadyProcessed => "This payment has already been processed.",
            AgreementError::PaymentFailed => "Payment transfer failed. Check permissions and balance.",
            AgreementError::PaymentInvalidAmount => "The payment amount is invalid or zero.",

            AgreementError::TimelockNotFound => "Timelock action not found.",
            AgreementError::TimelockAlreadyExecuted => {
                "This timelock action has already been executed."
            }
            AgreementError::TimelockAlreadyCancelled => {
                "This timelock action has already been cancelled."
            }
            AgreementError::TimelockEtaNotReached => "The timelock ETA has not been reached yet.",

            AgreementError::EscrowNotFound => "Escrow account not found for this agreement.",
            AgreementError::EscrowAlreadyReleased => "Escrow funds have already been released.",
            AgreementError::EscrowInsufficientFunds => {
                "Insufficient funds in escrow for this withdrawal."
            }
            AgreementError::EscrowTimeoutNotReached => "Escrow period has not yet expired.",

            AgreementError::InsufficientPermissions => {
                "Insufficient permissions to perform this action."
            }
            AgreementError::AdminOnly => "This operation is restricted to contract administrators.",
            AgreementError::InvalidTransition => "Invalid state transition for the current record.",
            AgreementError::InvalidInput => "Invalid input data provided to the function.",
            AgreementError::InvalidAddress => "A provided address is invalid or malformed.",

            AgreementError::RateLimitExceeded => "Rate limit exceeded. Please wait before retrying.",
            AgreementError::CooldownNotMet => "Operation cooldown period has not yet met.",
            AgreementError::InternalError => "An unexpected internal error occurred.",
            AgreementError::TimelockDelayTooShort => {
                "The specified delay is below the minimum required for this action type."
            }

            AgreementError::MultiSigNotInitialized => {
                "Multi-sig has not been initialized for this contract."
            }
            AgreementError::ProposalNotFound => "The specified proposal does not exist.",
            AgreementError::ProposalAlreadyExecuted => "This proposal has already been executed.",
            AgreementError::ProposalExpired => {
                "The proposal has expired and can no longer be executed."
            }
            AgreementError::InsufficientApprovals => {
                "Insufficient approvals to execute this proposal."
            }
            AgreementError::AlreadyApproved => "You have already approved this proposal.",
        };
        String::from_str(env, msg)
    }

    pub fn code(&self) -> u32 {
        *self as u32
    }
}

pub fn log_error(
    env: &Env,
    error: AgreementError,
    operation: String,
    details: String,
) -> Result<(), AgreementError> {
    let mut count: u32 = env
        .storage()
        .instance()
        .get(&DataKey::ErrorLogCount)
        .unwrap_or(0);

    let context = ErrorContext {
        error_code: error.code(),
        error_message: error.message(env),
        details,
        timestamp: env.ledger().timestamp(),
        operation,
    };

    env.storage()
        .persistent()
        .set(&DataKey::ErrorLog(count), &context);

    count += 1;
    env.storage()
        .instance()
        .set(&DataKey::ErrorLogCount, &count);

    // Publish event
    crate::events::error_occurred(
        env,
        context.error_code,
        context.operation,
        context.timestamp,
    );

    Ok(())
}

pub fn get_error_logs(env: &Env, limit: u32) -> Result<Vec<ErrorContext>, AgreementError> {
    let count: u32 = env
        .storage()
        .instance()
        .get(&DataKey::ErrorLogCount)
        .unwrap_or(0);
    let mut logs = Vec::new(env);

    let start = count.saturating_sub(limit);

    for i in start..count {
        if let Some(log) = env
            .storage()
            .persistent()
            .get::<DataKey, ErrorContext>(&DataKey::ErrorLog(i))
        {
            logs.push_back(log);
        }
    }

    Ok(logs)
}
