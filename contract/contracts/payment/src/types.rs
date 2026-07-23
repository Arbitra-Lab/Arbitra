//! Data structures for the Payment contract.
use soroban_sdk::{contracttype, Address, Map, String, Vec};

/// Escalation type for programmable rent increases
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum EscalationType {
    /// Fixed annual percentage increase (rate in basis points, e.g. 500 = 5%)
    FixedAnnual,
    /// No escalation — rent stays flat for the entire lease
    None,
}

/// Configuration for programmable rent escalation per agreement
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct RentEscalationConfig {
    pub agreement_id: String,
    /// Annual increase rate in basis points (1 bps = 0.01%, so 500 = 5%)
    pub annual_rate_bps: u32,
    /// Number of rent payments per year (e.g. 12 for monthly, 52 for weekly)
    pub payments_per_year: u32,
    pub escalation_type: EscalationType,
}

/// Configuration for late fee calculation per agreement
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct LateFeeConfig {
    pub agreement_id: String,
    /// Percentage of rent charged as late fee (e.g. 5 = 5%)
    pub late_fee_percentage: u32,
    /// Number of days after due date before late fee applies
    pub grace_period_days: u32,
    /// Maximum late fee cap (in token units)
    pub max_late_fee: i128,
    /// Whether to compound the fee daily
    pub compounding: bool,
}

/// Record of a late fee applied to a specific payment
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct LateFeeRecord {
    pub payment_id: String,
    pub days_late: u32,
    pub base_amount: i128,
    pub late_fee: i128,
    pub total_due: i128,
    pub calculated_at: u64,
    pub waived: bool,
    pub waive_reason: Option<String>,
}

/// A single breakpoint in a tiered fee schedule. A tier applies to any gross
/// amount greater than or equal to `threshold`, up to (but not including) the
/// next tier's threshold.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct FeeTier {
    /// Inclusive lower bound of gross amount for this tier. The first tier in
    /// a schedule must have `threshold == 0`.
    pub threshold: i128,
    /// Fee rate for this tier, in basis points (1 bps = 0.01%). Must be
    /// between 0 and 10_000 inclusive.
    pub bps: u32,
}

/// Stored, admin-configurable tiered fee schedule. Tiers must be ordered by
/// strictly increasing, non-overlapping `threshold`, starting at 0. Validate
/// with [`crate::late_fee::validate_fee_schedule`] before persisting.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct FeeSchedule {
    pub tiers: Vec<FeeTier>,
}

/// A per-payer fee discount, applied on top of the resolved tier rate.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct PayerDiscount {
    pub payer: Address,
    /// Discount subtracted from the tier's bps (floored at 0), in basis
    /// points. Must be between 0 and 10_000 inclusive.
    pub discount_bps: u32,
}

/// The deterministic result of quoting a fee for a gross amount and payer.
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct FeeQuote {
    /// Index of the resolved tier within the fee schedule.
    pub tier_index: u32,
    /// The original amount the fee was quoted against.
    pub gross: i128,
    /// The fee charged, after any per-payer discount and rounding.
    pub fee: i128,
    /// The amount the discount saved versus the undiscounted tier rate.
    pub discount: i128,
    /// `gross - fee`. Always exact: `fee + net == gross`.
    pub net: i128,
}

/// Payment record for tracking individual payments
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct PaymentRecord {
    pub agreement_id: String,
    pub payment_number: u32,
    pub amount: i128,
    pub landlord_amount: i128,
    pub agent_amount: i128,
    pub timestamp: u64,
    pub tenant: Address,
}

/// Payment split information for rent payments
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct PaymentSplit {
    pub landlord_amount: i128,
    pub platform_amount: i128,
    pub token: Address,
    pub payment_date: u64,
}

/// Agreement status enum (needed for payment validation)
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum AgreementStatus {
    Draft,
    Pending,
    Active,
    Completed,
    Cancelled,
    Terminated,
    Disputed,
}

/// Rent agreement structure (needed for payment processing)
#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct RentAgreement {
    pub agreement_id: String,
    pub landlord: Address,
    pub tenant: Address,
    pub agent: Option<Address>,
    pub monthly_rent: i128,
    pub security_deposit: i128,
    pub start_date: u64,
    pub end_date: u64,
    pub agent_commission_rate: u32,
    pub status: AgreementStatus,
    pub total_rent_paid: i128,
    pub payment_count: u32,
    pub signed_at: Option<u64>,
    pub payment_token: Address,
    pub next_payment_due: u64,
    pub payment_history: Map<u32, PaymentSplit>,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct RecurringPayment {
    pub id: String,
    pub agreement_id: String,
    pub payer: Address,
    pub payee: Address,
    pub amount: i128,
    pub frequency: PaymentFrequency,
    pub start_date: u64,
    pub end_date: u64,
    pub next_payment_date: u64,
    pub status: RecurringStatus,
    pub auto_renew: bool,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum PaymentFrequency {
    Daily,
    Weekly,
    BiWeekly,
    Monthly,
    Quarterly,
    Annually,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum RecurringStatus {
    Active,
    Paused,
    Completed,
    Cancelled,
    Failed,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct PaymentExecution {
    pub recurring_id: String,
    pub executed_at: u64,
    /// Gross amount for this execution, prior to fee deduction.
    pub amount: i128,
    /// Platform fee quoted by the fee engine for this execution.
    pub fee: i128,
    /// Net amount (`amount - fee`) quoted by the fee engine for this execution.
    pub net: i128,
    pub status: ExecutionStatus,
    pub transaction_hash: Option<String>,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub enum ExecutionStatus {
    Success,
    Failed,
    Pending,
}

#[derive(Clone, Debug, Eq, PartialEq)]
pub enum RecurringPaymentEvent {
    RecurringPaymentCreated {
        recurring_id: String,
        agreement_id: String,
        amount: i128,
    },
    RecurringPaymentExecuted {
        recurring_id: String,
        executed_at: u64,
    },
    RecurringPaymentPaused {
        recurring_id: String,
    },
    RecurringPaymentResumed {
        recurring_id: String,
    },
    RecurringPaymentCancelled {
        recurring_id: String,
    },
    RecurringPaymentFailed {
        recurring_id: String,
    },
}

// ─── Rate Limiting Types ──────────────────────────────────────────────────────

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct RateLimitConfig {
    pub max_calls_per_block: u32,
    pub max_calls_per_user_per_day: u32,
    pub cooldown_blocks: u32,
}

#[contracttype]
#[derive(Clone, Debug, Eq, PartialEq)]
pub struct UserCallCount {
    pub user: Address,
    pub call_count: u32,
    pub last_call_block: u64,
    pub daily_count: u32,
    pub daily_reset_block: u64,
}
