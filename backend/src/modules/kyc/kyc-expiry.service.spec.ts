import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { getQueueToken } from '@nestjs/bull';
import { KycExpiryService } from './kyc-expiry.service';
import { Kyc } from './kyc.entity';
import { KycStatus } from './kyc-status.enum';
import { UserKycStatusService } from '../users/user-kyc-status.service';
import { NotificationsService } from '../notifications/notifications.service';
import { AuditService } from '../audit/audit.service';
import {
  KYC_CONFIG,
  calculateKycExpiryDate,
  getReminderDates,
  shouldSendReminder,
} from './kyc-config';

describe('KycExpiryService', () => {
  let service: KycExpiryService;
  let kycRepository: any;
  let userKycStatusService: UserKycStatusService;
  let notificationsService: NotificationsService;
  let auditService: AuditService;
  let emailQueue: any;

  const mockKyc = {
    id: 'kyc-123',
    userId: 'user-123',
    status: KycStatus.APPROVED,
    isExpired: false,
    needsReVerification: false,
    expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // 30 days from now
    lastReminderSentAt: null,
    encryptedKycData: { firstName: 'John' },
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        KycExpiryService,
        {
          provide: getRepositoryToken(Kyc),
          useValue: {
            find: jest.fn(),
            createQueryBuilder: jest.fn(),
            save: jest.fn(),
            findOne: jest.fn(),
          },
        },
        {
          provide: UserKycStatusService,
          useValue: {
            setStatus: jest.fn(),
          },
        },
        {
          provide: NotificationsService,
          useValue: {
            notify: jest.fn(),
          },
        },
        {
          provide: AuditService,
          useValue: {
            log: jest.fn(),
          },
        },
        {
          provide: getQueueToken('email'),
          useValue: {
            add: jest.fn(),
          },
        },
      ],
    }).compile();

    service = module.get<KycExpiryService>(KycExpiryService);
    kycRepository = module.get(getRepositoryToken(Kyc));
    userKycStatusService = module.get<UserKycStatusService>(UserKycStatusService);
    notificationsService = module.get<NotificationsService>(NotificationsService);
    auditService = module.get<AuditService>(AuditService);
    emailQueue = module.get(getQueueToken('email'));
  });

  describe('calculateKycExpiryDate', () => {
    it('should calculate expiry date with custom validity period', () => {
      const expiryDate = calculateKycExpiryDate(90);
      const now = new Date();
      const expectedDate = new Date(now);
      expectedDate.setDate(expectedDate.getDate() + 90);

      // Allow 1 minute tolerance due to execution time
      expect(expiryDate.getTime()).toBeCloseTo(expectedDate.getTime(), -4);
    });

    it('should calculate expiry date with default validity period', () => {
      const expiryDate = calculateKycExpiryDate();
      const now = new Date();
      const expectedDate = new Date(now);
      expectedDate.setDate(expectedDate.getDate() + KYC_CONFIG.VALIDITY_PERIOD_DAYS);

      expect(expiryDate.getTime()).toBeCloseTo(expectedDate.getTime(), -4);
    });
  });

  describe('getReminderDates', () => {
    it('should calculate reminder dates for all configured offsets', () => {
      const expiryDate = new Date('2025-12-31');
      const reminderDates = getReminderDates(expiryDate);

      expect(reminderDates).toHaveLength(KYC_CONFIG.REMINDER_OFFSETS_DAYS.length);

      reminderDates.forEach((date, index) => {
        const offset = KYC_CONFIG.REMINDER_OFFSETS_DAYS[index];
        const expectedDate = new Date(expiryDate);
        expectedDate.setDate(expectedDate.getDate() - offset);

        expect(date.toDateString()).toBe(expectedDate.toDateString());
      });
    });
  });

  describe('shouldSendReminder', () => {
    it('should send reminder if no previous reminder sent', () => {
      const reminderDate = new Date(Date.now() - 1000); // 1 second ago
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
      const yesterday = new Date(Date.now() - 24 * 60 * 60 * 1000);
      const reminderDate = new Date(Date.now() - 1000);
      const result = shouldSendReminder(yesterday, reminderDate, 30);

      expect(result).toBe(true);
    });

    it('should not send reminder if reminder date is in the future', () => {
      const reminderDate = new Date(Date.now() + 1000 * 60 * 60); // 1 hour from now
      const result = shouldSendReminder(null, reminderDate, 30);

      expect(result).toBe(false);
    });
  });

  describe('checkKycExpiry', () => {
    it('should mark expired KYC records and downgrade user status', async () => {
      const expiredKyc = {
        ...mockKyc,
        expiresAt: new Date(Date.now() - 1000), // Already expired
      };

      const queryBuilder = {
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue([expiredKyc]),
      };

      kycRepository.createQueryBuilder.mockReturnValue(queryBuilder);
      kycRepository.save.mockResolvedValue(expiredKyc);

      await service.checkKycExpiry();

      expect(kycRepository.save).toHaveBeenCalled();
      expect(userKycStatusService.setStatus).toHaveBeenCalledWith(
        expiredKyc.userId,
        KycStatus.PENDING,
      );
      expect(notificationsService.notify).toHaveBeenCalled();
    });

    it('should handle no expired records gracefully', async () => {
      const queryBuilder = {
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue([]),
      };

      kycRepository.createQueryBuilder.mockReturnValue(queryBuilder);

      await service.checkKycExpiry();

      expect(auditService.log).toHaveBeenCalled();
    });

    it('should log audit on error', async () => {
      const error = new Error('Database error');
      const queryBuilder = {
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockRejectedValue(error),
      };

      kycRepository.createQueryBuilder.mockReturnValue(queryBuilder);

      await expect(service.checkKycExpiry()).rejects.toThrow(error);
      expect(auditService.log).toHaveBeenCalledWith(
        expect.objectContaining({
          status: 'failure',
        }),
      );
    });
  });

  describe('sendKycExpiryReminders', () => {
    it('should queue reminders for expiring KYC records', async () => {
      const expiryDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
      const kycRecord = {
        ...mockKyc,
        expiresAt: expiryDate,
        lastReminderSentAt: null,
      };

      const queryBuilder = {
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue([kycRecord]),
      };

      kycRepository.createQueryBuilder.mockReturnValue(queryBuilder);
      emailQueue.add.mockResolvedValue({ id: 'job-123' });
      kycRepository.save.mockResolvedValue(kycRecord);

      await service.sendKycExpiryReminders();

      expect(emailQueue.add).toHaveBeenCalled();
      expect(kycRepository.save).toHaveBeenCalled();
    });

    it('should not queue reminders for expired records', async () => {
      const kycRecord = {
        ...mockKyc,
        isExpired: true,
      };

      const queryBuilder = {
        where: jest.fn().mockReturnThis(),
        andWhere: jest.fn().mockReturnThis(),
        getMany: jest.fn().mockResolvedValue([kycRecord]),
      };

      kycRepository.createQueryBuilder.mockReturnValue(queryBuilder);

      await service.sendKycExpiryReminders();

      expect(emailQueue.add).not.toHaveBeenCalled();
    });
  });

  describe('initiateReVerification', () => {
    it('should reset KYC status and notify user', async () => {
      const kycRecord = { ...mockKyc };

      kycRepository.findOne.mockResolvedValue(kycRecord);
      kycRepository.save.mockResolvedValue({
        ...kycRecord,
        status: KycStatus.PENDING,
        isExpired: false,
      });

      const result = await service.initiateReVerification('user-123');

      expect(result.status).toBe(KycStatus.PENDING);
      expect(result.isExpired).toBe(false);
      expect(userKycStatusService.setStatus).toHaveBeenCalledWith(
        'user-123',
        KycStatus.PENDING,
      );
      expect(notificationsService.notify).toHaveBeenCalled();
      expect(auditService.log).toHaveBeenCalled();
    });

    it('should throw error if KYC record not found', async () => {
      kycRepository.findOne.mockResolvedValue(null);

      await expect(service.initiateReVerification('user-999')).rejects.toThrow(
        'KYC record not found',
      );
    });
  });

  describe('getKycExpiryInfo', () => {
    it('should return expiry info for user with approved KYC', async () => {
      const expiryDate = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
      const kycRecord = {
        ...mockKyc,
        expiresAt: expiryDate,
      };

      kycRepository.findOne.mockResolvedValue(kycRecord);

      const result = await service.getKycExpiryInfo('user-123');

      expect(result.expiresAt).toEqual(expiryDate);
      expect(result.isExpired).toBe(false);
      expect(result.needsReVerification).toBe(false);
      expect(result.daysUntilExpiry).toBeGreaterThan(0);
      expect(result.daysUntilExpiry).toBeLessThanOrEqual(31);
    });

    it('should return default values if no KYC record found', async () => {
      kycRepository.findOne.mockResolvedValue(null);

      const result = await service.getKycExpiryInfo('user-999');

      expect(result.expiresAt).toBeNull();
      expect(result.isExpired).toBe(false);
      expect(result.needsReVerification).toBe(false);
      expect(result.daysUntilExpiry).toBeNull();
    });

    it('should return null daysUntilExpiry for expired records', async () => {
      const kycRecord = {
        ...mockKyc,
        isExpired: true,
      };

      kycRepository.findOne.mockResolvedValue(kycRecord);

      const result = await service.getKycExpiryInfo('user-123');

      expect(result.isExpired).toBe(true);
      expect(result.daysUntilExpiry).toBeNull();
    });
  });
});
