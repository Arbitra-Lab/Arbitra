# Fee Split Configuration Implementation (Issue #86)

## Summary
Implemented configurable fee splits for the Arbitra payment contract, enabling atomic distribution of funds across multiple recipients (platform, arbiters, referrers, etc.) in a single transaction with deterministic rounding.

## Key Features

### 1. **Configuration Management**
- `FeeSplitConfig`: Define how payments are split across recipients
- `FeeSplitRecipient`: Individual recipient with basis points allocation
- Recipients must total exactly 100% (10,000 basis points)
- Maximum 10 recipients per configuration
- No duplicate recipients allowed

### 2. **Validation**
- Enforced validation ensures configurations are always valid
- Checks:
  - Recipients list is not empty
  - No more than 10 recipients
  - No duplicate recipient addresses
  - All basis points ≤ 10,000
  - Total basis points = exactly 10,000 (100%)
- Returns specific error types for each validation failure

### 3. **Atomic Transfers**
- All recipients receive their funds in a single atomic transaction
- Uses `soroban_sdk::token::Client` for secure token transfers
- If any transfer fails, the entire transaction reverts

### 4. **Deterministic Rounding**
- Handles rounding edge cases by assigning remainder to last recipient
- Guarantees exact distribution: sum of all allocations = total payment
- Works correctly for all amount sizes from 1 to billions

### 5. **Event Logging**
- `FeeSplitConfigSet`: Emitted when configuration is created/updated
- `FeeSplitExecuted`: Emitted for each recipient's payment with:
  - Config ID
  - Agreement ID
  - Recipient address
  - Amount transferred
  - Basis points allocated
  - Payment number

## API

### Types
```rust
pub struct FeeSplitRecipient {
    pub address: Address,
    pub basis_points: u32,
}

pub struct FeeSplitConfig {
    pub config_id: String,
    pub agreement_id: String,
    pub recipients: Vec<FeeSplitRecipient>,
    pub created_at: u64,
    pub active: bool,
}

pub struct FeeSplitRecord {
    pub config_id: String,
    pub agreement_id: String,
    pub recipient: Address,
    pub basis_points: u32,
    pub amount: i128,
    pub timestamp: u64,
    pub payment_number: u32,
}
```

### Functions

#### Validation
```rust
pub fn validate_fee_split_config(
    recipients: &Vec<FeeSplitRecipient>
) -> Result<(), PaymentError>
```
Validates a fee split configuration before storing.

#### Configuration Management
```rust
pub fn set_fee_split_config(
    env: Env,
    config_id: String,
    agreement_id: String,
    recipients: Vec<FeeSplitRecipient>,
) -> Result<(), PaymentError>

pub fn get_fee_split_config(
    env: &Env,
    agreement_id: &String,
) -> Result<FeeSplitConfig, PaymentError>
```

#### Payment Execution
```rust
pub fn execute_fee_split_payment(
    env: Env,
    agreement_id: String,
    token: Address,
    total_amount: i128,
    payer: Address,
    payment_number: u32,
) -> Result<(), PaymentError>

pub fn calculate_fee_splits(
    env: &Env,
    amount: &i128,
    recipients: &Vec<FeeSplitRecipient>,
) -> Vec<(Address, i128)>
```

### Contract Methods

```rust
pub fn set_fee_split_config(
    env: Env,
    agreement_id: String,
    recipients: Vec<FeeSplitRecipient>,
) -> Result<(), Error>

pub fn get_fee_split_config(
    env: Env,
    agreement_id: String,
) -> Result<FeeSplitConfig, Error>

pub fn pay_with_fee_split(
    env: Env,
    agreement_id: String,
    token: Address,
    total_amount: i128,
) -> Result<(), Error>
```

## Usage Example

```rust
// Create a 3-way split: Platform 40%, Arbiter 30%, Referrer 30%
let recipients = vec![
    FeeSplitRecipient {
        address: platform_addr,
        basis_points: 4000,  // 40%
    },
    FeeSplitRecipient {
        address: arbiter_addr,
        basis_points: 3000,  // 30%
    },
    FeeSplitRecipient {
        address: referrer_addr,
        basis_points: 3000,  // 30%
    },
];

// Set the configuration
contract.set_fee_split_config(
    env,
    "agreement_123".into(),
    recipients,
)?;

// Execute a payment with automatic splitting
contract.pay_with_fee_split(
    env,
    "agreement_123".into(),
    token_address,
    1_000_000,  // 1 million units to split
)?;
// Results:
// - Platform receives: 400,000
// - Arbiter receives: 300,000
// - Referrer receives: 300,000
```

## Error Handling

New error types:
- `FeeSplitConfigNotFound`: Configuration doesn't exist
- `InvalidFeeSplitTotal`: Recipients don't sum to 100%
- `EmptyFeeSplitRecipients`: No recipients provided
- `TooManyFeeSplitRecipients`: > 10 recipients
- `InvalidRecipientBasisPoints`: Basis points > 10,000
- `DuplicateFeeSplitRecipient`: Duplicate addresses

## Storage

Fee split data is persisted with keys:
- `FeeSplitConfig(config_id)`: Configuration by ID
- `AgreementFeeSplit(agreement_id)`: Active config for agreement
- `FeeSplitRecord(agreement_id, payment_number)`: Execution records

## Testing

Comprehensive test suite with 7 tests:
- Valid 50/50 split
- Invalid total (90% instead of 100%)
- Empty recipients list
- Invalid basis points (> 10,000)
- Duplicate recipients
- Three-way split validation
- Single recipient with 100% allocation

All tests pass successfully (74 total tests including existing tests).

## Security Considerations

1. **Authorization**: Only agreement landlord can set fee split config
2. **Atomic Transfers**: All-or-nothing transaction semantics
3. **Validation**: Configuration validated before storage
4. **Audit Trail**: All splits logged as events
5. **Exact Arithmetic**: No fund loss due to rounding
6. **Storage Isolation**: Per-agreement configurations

## Implementation Details

### Rounding Strategy
When dividing an amount by multiple recipients, the calculation follows:
1. For each non-last recipient: `amount * basis_points / 10000`
2. For the last recipient: `remaining_amount` (guarantees exact total)
3. This deterministic approach prevents fund loss

Example with 1000 units split 33.33%/33.33%/33.34%:
- Recipient 1: 333
- Recipient 2: 333
- Recipient 3: 334 (gets the remainder)
- Total: 1000 ✓

## Related Files Modified

- `types.rs`: Added FeeSplitConfig, FeeSplitRecipient, FeeSplitRecord types
- `storage.rs`: Added storage keys for fee split data
- `errors.rs`: Added error types for fee split validation
- `events.rs`: Added fee split event definitions
- `payment_impl.rs`: Core fee split logic
- `lib.rs`: Contract interface and public exports
- `tests_fee_split.rs`: Comprehensive test suite (new file)
