use soroban_sdk::contracterror;

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq)]
#[repr(u32)]
pub enum AgentError {
    AlreadyInitialized = 1,
    NotInitialized = 2,
    AgentAlreadyRegistered = 3,
    AgentNotFound = 4,
    Unauthorized = 5,
    AlreadyVerified = 6,
    InvalidProfileHash = 7,
    InvalidRatingScore = 8,
    AgentNotVerified = 9,
    AlreadyRated = 10,
    TransactionNotFound = 11,
    NotTransactionParty = 12,
    TransactionNotCompleted = 13,
    StakeConfigNotSet = 14,
    InvalidAmount = 15,
    InsufficientStake = 16,
    NothingToWithdraw = 17,
    UnbondingNotElapsed = 18,
    MathOverflow = 19,
}
