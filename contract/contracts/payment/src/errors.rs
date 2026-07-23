//! Custom error types for the Payment contract.
use soroban_sdk::contracterror;

#[contracterror]
#[derive(Copy, Clone, Debug, Eq, PartialEq)]
#[repr(u32)]
pub enum PaymentError {
    /// Payment record not found
    PaymentNotFound = 11,
    /// Payment processing failed
    PaymentFailed = 12,
    /// Agreement not found
    AgreementNotFound = 13,
    /// Caller is not the tenant
    NotTenant = 14,
    /// Agreement is not active
    AgreementNotActive = 10,
    /// Invalid payment amount
    InvalidPaymentAmount = 17,
    /// Payment not yet due
    PaymentNotDue = 18,
    /// Invalid amount provided
    InvalidAmount = 5,
    /// Recurring payment not found
    RecurringPaymentNotFound = 19,
    /// Invalid recurring payment dates
    InvalidRecurringDates = 20,
    /// Recurring payment is not active
    RecurringPaymentNotActive = 21,
    /// Recurring payment is not paused
    RecurringPaymentNotPaused = 22,
    /// Recurring payment already cancelled
    RecurringPaymentAlreadyCancelled = 23,
    /// Recurring payment already completed
    RecurringPaymentAlreadyCompleted = 24,
    /// Recurring payment execution failed
    RecurringPaymentExecutionFailed = 25,
    /// Recurring payment is not failed
    RecurringPaymentNotFailed = 26,
    /// Rate limit exceeded for this operation
    RateLimitExceeded = 27,
    /// Cooldown period not met
    CooldownNotMet = 28,
    /// Late fee config not found for agreement
    LateFeeConfigNotFound = 29,
    /// Late fee record not found for payment
    LateFeeRecordNotFound = 30,
    /// Late fee already applied to this payment
    LateFeeAlreadyApplied = 31,
    /// Late fee already waived
    LateFeeAlreadyWaived = 32,
    /// Invalid late fee percentage (must be > 0 and <= 100)
    InvalidLateFeePercentage = 33,
    /// Payment is not late (within grace period)
    PaymentNotLate = 34,
    /// Caller is not the landlord
    NotLandlord = 35,
    /// Fee schedule not found / not configured
    FeeScheduleNotFound = 36,
    /// Fee schedule is invalid: tiers must start at threshold 0, be strictly
    /// increasing and non-overlapping, and each bps must be <= 10_000
    InvalidFeeSchedule = 37,
    /// Discount basis points out of valid range (must be <= 10_000)
    InvalidDiscount = 38,
    /// Caller is not authorized to perform this admin action
    NotAuthorized = 39,
}
