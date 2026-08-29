/**
 * KYC Configuration
 * Defines configurable parameters for KYC verification validity and reminders
 */
export const KYC_CONFIG = {
  // KYC validity period in days
  VALIDITY_PERIOD_DAYS: parseInt(process.env.KYC_VALIDITY_PERIOD_DAYS || '365'),

  // Reminder offsets in days (days before expiry to send reminders)
  REMINDER_OFFSETS_DAYS: [30, 7, 1],

  // Cron schedule for checking KYC expiry (runs daily at 2 AM UTC)
  EXPIRY_CHECK_CRON: '0 2 * * *',

  // Cron schedule for sending reminders (runs daily at 9 AM UTC)
  REMINDER_CHECK_CRON: '0 9 * * *',
};

/**
 * Calculate expiry date based on current date and validity period
 */
export function calculateKycExpiryDate(
  validityDays: number = KYC_CONFIG.VALIDITY_PERIOD_DAYS,
): Date {
  const expiryDate = new Date();
  expiryDate.setDate(expiryDate.getDate() + validityDays);
  return expiryDate;
}

/**
 * Get reminder dates for a given expiry date
 */
export function getReminderDates(expiryDate: Date): Date[] {
  return KYC_CONFIG.REMINDER_OFFSETS_DAYS.map((offsetDays) => {
    const reminderDate = new Date(expiryDate);
    reminderDate.setDate(reminderDate.getDate() - offsetDays);
    return reminderDate;
  });
}

/**
 * Check if a reminder should be sent based on last reminder time and offset
 */
export function shouldSendReminder(
  lastReminderSentAt: Date | null,
  reminderDate: Date,
  offsetDays: number,
): boolean {
  const now = new Date();

  // Never sent a reminder at this offset
  if (!lastReminderSentAt) {
    return now >= reminderDate;
  }

  // Check if reminder was already sent today at this offset
  const lastReminderDay = new Date(lastReminderSentAt).toDateString();
  const todayDay = now.toDateString();

  // Allow re-sending reminder if it's a different day
  if (lastReminderDay !== todayDay) {
    return now >= reminderDate;
  }

  return false;
}
