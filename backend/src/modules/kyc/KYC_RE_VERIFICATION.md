# KYC Re-Verification and Expiry Reminders

## Overview

This feature implements automated KYC (Know Your Customer) re-verification scheduling and expiry reminder notifications. KYC records now have a configurable validity period after which they expire and require re-verification.

## Features

### 1. Configurable KYC Validity Period
- KYC records expire after a configurable period (default: 365 days)
- Expiry date is automatically calculated and stored when KYC is approved
- Configurable via `KYC_VALIDITY_PERIOD_DAYS` environment variable

### 2. Scheduled Expiry Checks
- Daily cron job at 2 AM UTC checks for expired KYC records
- Marks expired records and downgrades user KYC status to PENDING
- Sends expiry notification to users
- Fully audited with detailed logging

### 3. Tiered Reminder Notifications
- Reminders sent at configurable offsets: 30 days, 7 days, 1 day before expiry
- Reminders are queued to email processor for reliable delivery
- Prevents duplicate reminders on the same day
- Customizable reminder dates in `KYC_CONFIG.REMINDER_OFFSETS_DAYS`

### 4. Re-Verification Endpoint
- Users can trigger re-verification at any time via `/kyc/re-verify` endpoint
- Resets KYC status to PENDING for fresh verification cycle
- Sends notification to user when re-verification is initiated
- Clears expiry tracking for new verification cycle

### 5. Expiry Information Retrieval
- New endpoint `/kyc/expiry-info` provides current expiry status
- Returns: expiry date, expired status, re-verification requirement, days until expiry
- Accessible only to authenticated users

## Database Schema

### New Columns on `kyc` table
- `expires_at` (timestamp, nullable): Date when verification expires
- `is_expired` (boolean, default: false): Whether verification has expired
- `last_reminder_sent_at` (timestamp, nullable): Last time reminder was sent
- `needs_re_verification` (boolean, default: false): Whether re-verification is required

### Indexes
- `idx_kyc_expires_at`: ON kyc(expires_at) WHERE is_expired = false
- `idx_kyc_needs_re_verification`: ON kyc(needs_re_verification)

## Configuration

### Environment Variables

```env
# KYC validity period in days (default: 365)
KYC_VALIDITY_PERIOD_DAYS=365

# KYC webhook secret for signature verification
KYC_WEBHOOK_SECRET=your-kyc-webhook-secret
```

### Cron Schedules

- **Expiry Check**: `0 2 * * *` (Daily at 2 AM UTC)
- **Reminder Check**: `0 9 * * *` (Daily at 9 AM UTC)

Both are defined in `kyc-config.ts` and can be customized.

## API Endpoints

### 1. Submit KYC (Existing)
```
POST /kyc/submit
Authorization: Bearer <jwt>
Content-Type: application/json

{
  "kycData": {
    "first_name": "John",
    "last_name": "Doe",
    "date_of_birth": "1990-01-01",
    "address_country_code": "US"
  }
}

Response: 200 OK
{
  "id": "kyc-uuid",
  "userId": "user-uuid",
  "status": "PENDING",
  "expiresAt": null,
  "isExpired": false
}
```

### 2. Get KYC Status (Existing)
```
GET /kyc/status
Authorization: Bearer <jwt>

Response: 200 OK
{
  "id": "kyc-uuid",
  "status": "APPROVED",
  "expiresAt": "2025-08-29T10:00:00Z",
  "isExpired": false
}
```

### 3. Get KYC Expiry Info (New)
```
GET /kyc/expiry-info
Authorization: Bearer <jwt>

Response: 200 OK
{
  "expiresAt": "2025-08-29T10:00:00Z",
  "isExpired": false,
  "needsReVerification": false,
  "daysUntilExpiry": 365
}
```

### 4. Initiate Re-Verification (New)
```
POST /kyc/re-verify
Authorization: Bearer <jwt>

Response: 200 OK
{
  "id": "kyc-uuid",
  "userId": "user-uuid",
  "status": "PENDING",
  "expiresAt": null,
  "isExpired": false,
  "needsReVerification": false
}
```

### 5. KYC Webhook (Existing)
```
POST /kyc/webhook
Content-Type: application/json
X-Signature: <signature>

{
  "providerReference": "provider-ref-123",
  "status": "APPROVED"
}

Response: 200 OK
{
  "success": true
}
```

When webhook sets status to APPROVED, expiry date is automatically calculated and set.

## Service Architecture

### KycService
- Handles KYC submission and webhook processing
- Sets expiry date when KYC is approved
- Manages encryption/decryption of KYC data

### KycExpiryService
- **Scheduled Jobs**:
  - `checkKycExpiry()`: Runs daily to mark expired records
  - `sendKycExpiryReminders()`: Runs daily to queue reminder notifications
- **Manual Operations**:
  - `initiateReVerification()`: Resets KYC for re-verification
  - `getKycExpiryInfo()`: Retrieves current expiry status

### KycConfig
- Utility functions for expiry and reminder calculations
- Configuration constants (validity period, offsets, cron schedules)
- Helper functions: `calculateKycExpiryDate()`, `getReminderDates()`, `shouldSendReminder()`

## Job Queue Integration

### Email Queue
- Reminders are queued to the 'email' queue for delivery
- Job type: `notification`
- Template: `kyc-expiry-reminder`
- Includes: `daysUntilExpiry`, `expiryDate`
- Retry policy: 3 attempts with exponential backoff (2s initial)

## Notification Types

### 1. KYC Approved (Existing)
Sent when KYC is first approved via webhook.

### 2. Expiry Reminders (New)
Sent at configured offsets (30, 7, 1 days before expiry):
- Subject: "KYC Verification Expires in {days} Day(s)"
- Template: kyc-expiry-reminder
- Only one reminder per day per offset

### 3. KYC Expired (New)
Sent when expiry date is reached:
- Title: "KYC Verification Expired"
- Message: "Your KYC verification has expired. Please re-verify..."
- Type: KYC_EXPIRED

### 4. Re-Verification Initiated (New)
Sent when user triggers re-verification:
- Title: "Re-verification Initiated"
- Message: "Please submit your updated KYC information..."
- Type: KYC_RE_VERIFICATION_INITIATED

## Audit Logging

All expiry-related operations are logged with full audit trail:
- KYC record expiry
- Reminder notification queuing
- Re-verification initiation
- Scheduled job execution
- Errors and failures

Audit records include:
- Action type
- Entity and entity ID
- User ID (system for automated jobs)
- Status (success/failure)
- Metadata (user ID, counts, operation details)

## Testing

### Unit Tests
- `kyc-config.spec.ts`: Tests configuration functions and constants
- `kyc-expiry.service.spec.ts`: Tests expiry service methods

### Integration Tests
- `kyc.integration.spec.ts`: End-to-end workflow tests

### Test Coverage
- Configuration calculations (expiry dates, reminders)
- Reminder decision logic (should send, not duplicate)
- Expiry marking and status downgrade
- Re-verification workflow
- Expiry info retrieval with various states

## Data Migration

A TypeORM migration file adds the required columns:
```
1691234567890-AddKycExpiryTracking.ts
```

Run migrations:
```bash
npm run migration:run
```

## Error Handling

The system handles the following scenarios gracefully:
- Missing KYC record for re-verification → throws "KYC record not found"
- Database errors → logged and audited
- Queue failures → retried with exponential backoff
- Notification failures → logged but don't block operations
- Expired record marked during job → user status downgraded atomically

## Performance Considerations

### Indexes
- `expires_at` indexed for efficient expiry queries
- `needs_re_verification` indexed for batch operations
- Indexes filtered (is_expired = false) to optimize active records

### Scheduled Job Optimization
- Jobs process records in batches using query builder
- Only queries relevant records (APPROVED status, not expired)
- Reminder check prevents duplicate sends per day
- Last reminder timestamp used for efficiency

### Database Load
- Cron jobs staggered (2 AM and 9 AM UTC)
- Batch processing prevents N+1 queries
- Indexed lookups for all operations

## Future Enhancements

Potential improvements for future iterations:
- Configurable reminder intervals per user
- KYC provider integration for automatic re-submission
- Bulk re-verification workflows
- Dashboard widgets showing expiry status
- Grace period before complete access denial
- Automated re-verification triggers based on risk scores
- Multi-language reminder templates
- SMS/push notification support for reminders

## Troubleshooting

### KYC not expiring
1. Check `KYC_VALIDITY_PERIOD_DAYS` is set correctly
2. Verify scheduled jobs are running (check logs for cron execution)
3. Ensure database migration was applied

### Reminders not sending
1. Verify email queue is connected and processing
2. Check email processor configuration
3. Review audit logs for queue failures
4. Ensure notification service is operational

### Re-verification failing
1. Verify user has existing KYC record
2. Check permissions/JWT token is valid
3. Review audit logs for error details

## Related Documentation

- [Audit Logging](../audit/README.md)
- [Email Queue Processing](../queues/README.md)
- [Notifications System](../notifications/README.md)
- [Security and Encryption](../security/README.md)
