import {
  KYC_CONFIG,
  calculateKycExpiryDate,
  getReminderDates,
  shouldSendReminder,
} from './kyc-config';

describe('KycConfig', () => {
  describe('calculateKycExpiryDate', () => {
    it('should calculate expiry date with default validity period', () => {
      const before = new Date();
      const expiryDate = calculateKycExpiryDate();
      const after = new Date();

      const expectedDate = new Date(before);
      expectedDate.setDate(expectedDate.getDate() + KYC_CONFIG.VALIDITY_PERIOD_DAYS);

      // Should be within 1 second tolerance
      expect(
        Math.abs(expiryDate.getTime() - expectedDate.getTime()),
      ).toBeLessThan(1000);
    });

    it('should calculate expiry date with custom validity period', () => {
      const customDays = 180;
      const before = new Date();
      const expiryDate = calculateKycExpiryDate(customDays);
      const after = new Date();

      const expectedDate = new Date(before);
      expectedDate.setDate(expectedDate.getDate() + customDays);

      expect(
        Math.abs(expiryDate.getTime() - expectedDate.getTime()),
      ).toBeLessThan(1000);
    });

    it('should handle edge case of 1 day validity', () => {
      const expiryDate = calculateKycExpiryDate(1);
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);

      expect(expiryDate.getDate()).toBe(tomorrow.getDate());
      expect(expiryDate.getMonth()).toBe(tomorrow.getMonth());
      expect(expiryDate.getFullYear()).toBe(tomorrow.getFullYear());
    });
  });

  describe('getReminderDates', () => {
    it('should calculate reminder dates for all configured offsets', () => {
      const expiryDate = new Date('2025-12-31T00:00:00Z');
      const reminderDates = getReminderDates(expiryDate);

      expect(reminderDates).toHaveLength(KYC_CONFIG.REMINDER_OFFSETS_DAYS.length);

      // Verify offsets are correct
      reminderDates.forEach((date, index) => {
        const offset = KYC_CONFIG.REMINDER_OFFSETS_DAYS[index];
        const expectedDate = new Date(expiryDate);
        expectedDate.setDate(expectedDate.getDate() - offset);

        expect(date.toDateString()).toBe(expectedDate.toDateString());
      });
    });

    it('should return reminders in correct order', () => {
      const expiryDate = new Date('2025-12-31T00:00:00Z');
      const reminderDates = getReminderDates(expiryDate);

      // Verify dates are in descending order (30 days, 7 days, 1 day before expiry)
      for (let i = 0; i < reminderDates.length - 1; i++) {
        expect(reminderDates[i].getTime()).toBeGreaterThan(
          reminderDates[i + 1].getTime(),
        );
      }
    });
  });

  describe('shouldSendReminder', () => {
    it('should send reminder if never sent before', () => {
      const reminderDate = new Date(Date.now() - 1000); // Past
      const result = shouldSendReminder(null, reminderDate, 30);

      expect(result).toBe(true);
    });

    it('should not send reminder if already sent today', () => {
      const today = new Date();
      const reminderDate = new Date(Date.now() - 1000);
      const result = shouldSendReminder(today, reminderDate, 30);

      expect(result).toBe(false);
    });

    it('should send reminder if last sent on different day', () => {
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);

      const reminderDate = new Date(Date.now() - 1000);
      const result = shouldSendReminder(yesterday, reminderDate, 30);

      expect(result).toBe(true);
    });

    it('should not send reminder if reminder date is in future', () => {
      const futureReminderDate = new Date(Date.now() + 1000 * 60 * 60); // 1 hour ahead
      const result = shouldSendReminder(null, futureReminderDate, 30);

      expect(result).toBe(false);
    });

    it('should send reminder if last sent yesterday', () => {
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      yesterday.setHours(23, 59, 59);

      const reminderDate = new Date(Date.now() - 1000);
      const result = shouldSendReminder(yesterday, reminderDate, 30);

      expect(result).toBe(true);
    });

    it('should handle midnight boundary correctly', () => {
      // Create a date just before midnight
      const almostMidnight = new Date();
      almostMidnight.setHours(23, 59, 59);

      // Create a reminder date that's in the past
      const reminderDate = new Date(almostMidnight);
      reminderDate.setHours(0, 0, 0);
      reminderDate.setTime(reminderDate.getTime() - 1000); // 1 second ago

      const result = shouldSendReminder(almostMidnight, reminderDate, 30);

      // Should return false since they're on the same day
      expect(result).toBe(false);
    });
  });

  describe('KYC_CONFIG constants', () => {
    it('should have positive validity period in days', () => {
      expect(KYC_CONFIG.VALIDITY_PERIOD_DAYS).toBeGreaterThan(0);
    });

    it('should have reminder offsets in descending order', () => {
      const offsets = KYC_CONFIG.REMINDER_OFFSETS_DAYS;
      for (let i = 0; i < offsets.length - 1; i++) {
        expect(offsets[i]).toBeGreaterThan(offsets[i + 1]);
      }
    });

    it('should have valid cron expressions', () => {
      // Basic validation - cron should be a string
      expect(typeof KYC_CONFIG.EXPIRY_CHECK_CRON).toBe('string');
      expect(typeof KYC_CONFIG.REMINDER_CHECK_CRON).toBe('string');

      // Cron expressions should have 5 or 6 parts
      const expiryParts = KYC_CONFIG.EXPIRY_CHECK_CRON.split(' ');
      const reminderParts = KYC_CONFIG.REMINDER_CHECK_CRON.split(' ');

      expect([5, 6]).toContain(expiryParts.length);
      expect([5, 6]).toContain(reminderParts.length);
    });

    it('should include 1 day reminder offset', () => {
      expect(KYC_CONFIG.REMINDER_OFFSETS_DAYS).toContain(1);
    });

    it('should include 7 day reminder offset', () => {
      expect(KYC_CONFIG.REMINDER_OFFSETS_DAYS).toContain(7);
    });

    it('should include 30 day reminder offset', () => {
      expect(KYC_CONFIG.REMINDER_OFFSETS_DAYS).toContain(30);
    });
  });
});
