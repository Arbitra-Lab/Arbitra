import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Cron, CronExpression } from '@nestjs/schedule';
import { InjectQueue } from '@nestjs/bull';
import { Queue } from 'bull';
import { Kyc } from './kyc.entity';
import { KycStatus } from './kyc-status.enum';
import { UserKycStatusService } from '../users/user-kyc-status.service';
import { NotificationsService } from '../notifications/notifications.service';
import {
  KYC_CONFIG,
  getReminderDates,
  shouldSendReminder,
} from './kyc-config';
import { AuditService } from '../audit/audit.service';
import {
  AuditAction,
  AuditLevel,
  AuditStatus,
} from '../audit/entities/audit-log.entity';

@Injectable()
export class KycExpiryService {
  private readonly logger = new Logger(KycExpiryService.name);

  constructor(
    @InjectRepository(Kyc)
    private readonly kycRepository: Repository<Kyc>,
    private readonly userKycStatusService: UserKycStatusService,
    private readonly notificationsService: NotificationsService,
    private readonly auditService: AuditService,
    @InjectQueue('email')
    private readonly emailQueue: Queue,
  ) {}

  /**
   * Scheduled job to check for expiring/expired KYC records
   * Runs daily at 2 AM UTC
   */
  @Cron(KYC_CONFIG.EXPIRY_CHECK_CRON)
  async checkKycExpiry(): Promise<void> {
    this.logger.log('Starting KYC expiry check');

    try {
      // Find approved KYC records that are about to expire or have expired
      const now = new Date();
      const expiringKycRecords = await this.kycRepository.find({
        where: {
          status: KycStatus.APPROVED,
          isExpired: false,
          expiresAt: undefined, // Will use query builder for date comparison
        },
      });

      // Filter records using query builder for better date handling
      const query = this.kycRepository
        .createQueryBuilder('kyc')
        .where('kyc.status = :status', { status: KycStatus.APPROVED })
        .andWhere('kyc.isExpired = false')
        .andWhere('kyc.expiresAt IS NOT NULL')
        .andWhere('kyc.expiresAt <= :now', { now });

      const expiredRecords = await query.getMany();

      // Mark expired records
      for (const kyc of expiredRecords) {
        await this.markKycAsExpired(kyc);
      }

      this.logger.log(`KYC expiry check completed. Expired: ${expiredRecords.length}`);

      await this.auditService.log({
        action: AuditAction.UPDATE,
        entityType: 'Kyc',
        entityId: 'BATCH',
        performedBy: 'system',
        status: AuditStatus.SUCCESS,
        level: AuditLevel.INFO,
        metadata: { expiredCount: expiredRecords.length },
      });
    } catch (error) {
      this.logger.error('KYC expiry check failed', error);
      await this.auditService.log({
        action: AuditAction.UPDATE,
        entityType: 'Kyc',
        entityId: 'BATCH',
        performedBy: 'system',
        status: AuditStatus.FAILURE,
        level: AuditLevel.ERROR,
        errorMessage: error instanceof Error ? error.message : String(error),
        metadata: { operation: 'checkKycExpiry' },
      });
      throw error;
    }
  }

  /**
   * Scheduled job to send expiry reminders
   * Runs daily at 9 AM UTC
   */
  @Cron(KYC_CONFIG.REMINDER_CHECK_CRON)
  async sendKycExpiryReminders(): Promise<void> {
    this.logger.log('Starting KYC expiry reminder check');

    try {
      // Find approved KYC records that haven't expired yet
      const approvedKycRecords = await this.kycRepository.find({
        where: {
          status: KycStatus.APPROVED,
          isExpired: false,
          expiresAt: undefined, // Will use query builder
        },
      });

      // Get records with expiry dates in the future
      const query = this.kycRepository
        .createQueryBuilder('kyc')
        .where('kyc.status = :status', { status: KycStatus.APPROVED })
        .andWhere('kyc.isExpired = false')
        .andWhere('kyc.expiresAt IS NOT NULL')
        .andWhere('kyc.expiresAt > :now', { now: new Date() });

      const recordsToCheck = await query.getMany();

      let remindersQueued = 0;

      for (const kyc of recordsToCheck) {
        const remindersSent = await this.checkAndSendReminders(kyc);
        remindersQueued += remindersSent;
      }

      this.logger.log(`KYC reminder check completed. Reminders queued: ${remindersQueued}`);

      await this.auditService.log({
        action: AuditAction.UPDATE,
        entityType: 'Kyc',
        entityId: 'BATCH',
        performedBy: 'system',
        status: AuditStatus.SUCCESS,
        level: AuditLevel.INFO,
        metadata: { remindersQueued },
      });
    } catch (error) {
      this.logger.error('KYC reminder check failed', error);
      await this.auditService.log({
        action: AuditAction.UPDATE,
        entityType: 'Kyc',
        entityId: 'BATCH',
        performedBy: 'system',
        status: AuditStatus.FAILURE,
        level: AuditLevel.ERROR,
        errorMessage: error instanceof Error ? error.message : String(error),
        metadata: { operation: 'sendKycExpiryReminders' },
      });
      throw error;
    }
  }

  /**
   * Check and send reminders for a KYC record
   */
  private async checkAndSendReminders(kyc: Kyc): Promise<number> {
    if (!kyc.expiresAt) {
      return 0;
    }

    const reminderDates = getReminderDates(kyc.expiresAt);
    let remindersQueued = 0;

    for (let i = 0; i < reminderDates.length; i++) {
      const offsetDays = KYC_CONFIG.REMINDER_OFFSETS_DAYS[i];
      const reminderDate = reminderDates[i];

      if (shouldSendReminder(kyc.lastReminderSentAt, reminderDate, offsetDays)) {
        await this.queueReminderNotification(kyc, offsetDays);
        remindersQueued++;
      }
    }

    return remindersQueued;
  }

  /**
   * Queue a reminder notification to email queue
   */
  private async queueReminderNotification(
    kyc: Kyc,
    daysUntilExpiry: number,
  ): Promise<void> {
    try {
      await this.emailQueue.add(
        {
          type: 'notification',
          email: kyc.userId, // Will be resolved in processor
          subject: `KYC Verification Expires in ${daysUntilExpiry} Day${daysUntilExpiry > 1 ? 's' : ''}`,
          template: 'kyc-expiry-reminder',
          data: {
            daysUntilExpiry,
            expiryDate: kyc.expiresAt,
          },
        },
        {
          attempts: 3,
          backoff: {
            type: 'exponential',
            delay: 2000,
          },
          removeOnComplete: true,
        },
      );

      // Update last reminder sent time
      kyc.lastReminderSentAt = new Date();
      await this.kycRepository.save(kyc);

      this.logger.debug(
        `Reminder queued for user ${kyc.userId}: ${daysUntilExpiry} days until expiry`,
      );
    } catch (error) {
      this.logger.error(
        `Failed to queue reminder for user ${kyc.userId}`,
        error,
      );
      throw error;
    }
  }

  /**
   * Mark KYC record as expired and downgrade user status
   */
  private async markKycAsExpired(kyc: Kyc): Promise<void> {
    try {
      kyc.isExpired = true;
      kyc.needsReVerification = true;
      await this.kycRepository.save(kyc);

      // Downgrade user KYC status
      await this.userKycStatusService.setStatus(kyc.userId, KycStatus.PENDING);

      // Send expiry notification
      await this.notificationsService.notify(
        kyc.userId,
        'KYC Verification Expired',
        'Your KYC verification has expired. Please re-verify your identity to continue using all features.',
        'KYC_EXPIRED',
      );

      this.logger.log(`KYC marked as expired for user ${kyc.userId}`);

      await this.auditService.log({
        action: AuditAction.UPDATE,
        entityType: 'Kyc',
        entityId: kyc.id,
        performedBy: 'system',
        status: AuditStatus.SUCCESS,
        level: AuditLevel.SECURITY,
        metadata: { userId: kyc.userId, action: 'marked_as_expired' },
      });
    } catch (error) {
      this.logger.error(`Failed to mark KYC as expired for user ${kyc.userId}`, error);
      throw error;
    }
  }

  /**
   * Manually trigger re-verification for a user
   */
  async initiateReVerification(userId: string): Promise<Kyc> {
    try {
      let kyc = await this.kycRepository.findOne({ where: { userId } });

      if (!kyc) {
        throw new Error('KYC record not found');
      }

      // Reset expiry tracking for re-verification
      kyc.status = KycStatus.PENDING;
      kyc.isExpired = false;
      kyc.needsReVerification = false;
      kyc.expiresAt = null;
      kyc.lastReminderSentAt = null;

      kyc = await this.kycRepository.save(kyc);

      await this.userKycStatusService.setStatus(userId, KycStatus.PENDING);

      await this.notificationsService.notify(
        userId,
        'Re-verification Initiated',
        'Please submit your updated KYC information to continue verification.',
        'KYC_RE_VERIFICATION_INITIATED',
      );

      this.logger.log(`Re-verification initiated for user ${userId}`);

      await this.auditService.log({
        action: AuditAction.UPDATE,
        entityType: 'Kyc',
        entityId: kyc.id,
        performedBy: userId,
        status: AuditStatus.SUCCESS,
        level: AuditLevel.SECURITY,
        metadata: { userId, action: 're_verification_initiated' },
      });

      return kyc;
    } catch (error) {
      this.logger.error(`Failed to initiate re-verification for user ${userId}`, error);
      throw error;
    }
  }

  /**
   * Get KYC expiry information for a user
   */
  async getKycExpiryInfo(userId: string): Promise<{
    expiresAt: Date | null;
    isExpired: boolean;
    needsReVerification: boolean;
    daysUntilExpiry: number | null;
  }> {
    const kyc = await this.kycRepository.findOne({ where: { userId } });

    if (!kyc) {
      return {
        expiresAt: null,
        isExpired: false,
        needsReVerification: false,
        daysUntilExpiry: null,
      };
    }

    let daysUntilExpiry: number | null = null;
    if (kyc.expiresAt && !kyc.isExpired) {
      const now = new Date();
      const timeDiff = kyc.expiresAt.getTime() - now.getTime();
      daysUntilExpiry = Math.ceil(timeDiff / (1000 * 60 * 60 * 24));
    }

    return {
      expiresAt: kyc.expiresAt,
      isExpired: kyc.isExpired,
      needsReVerification: kyc.needsReVerification,
      daysUntilExpiry,
    };
  }
}
