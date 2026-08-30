import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Kyc } from './kyc.entity';
import { SubmitKycDto, KycWebhookDto } from './kyc.dto';
import { EncryptionService } from '../security/encryption.service';
import { AuditService } from '../audit/audit.service';
import {
  AuditAction,
  AuditLevel,
  AuditStatus,
} from '../audit/entities/audit-log.entity';
import {
  decryptSensitiveKycFields,
  encryptSensitiveKycFields,
} from './kyc-encryption.util';
import { UserKycStatusService } from '../users/user-kyc-status.service';
import { KycStatus } from './kyc-status.enum';
import { NotificationsService } from '../notifications/notifications.service';
import { calculateKycExpiryDate } from './kyc-config';

@Injectable()
export class KycService {
  private readonly logger = new Logger(KycService.name);

  constructor(
    @InjectRepository(Kyc)
    private readonly kycRepository: Repository<Kyc>,
    private readonly userKycStatusService: UserKycStatusService,
    private readonly encryptionService: EncryptionService,
    private readonly auditService: AuditService,
    private readonly notificationsService: NotificationsService,
  ) {}

  async submitKyc(userId: string, dto: SubmitKycDto): Promise<Kyc> {
    try {
      this.logger.log(`Submitting KYC for user ${userId}`);

      const encryptedKycData = this.encryptKycData(userId, dto.kycData);

      const kyc = this.kycRepository.create({
        userId,
        encryptedKycData,
        status: KycStatus.PENDING,
      });

      await this.userKycStatusService.setStatus(userId, KycStatus.PENDING);
      const savedKyc = await this.kycRepository.save(kyc);

      await this.notificationsService.notify(
        userId,
        'KYC submitted',
        'Your verification documents were submitted and are under review.',
        'KYC_SUBMITTED',
      );

      await this.auditService.log({
        action: AuditAction.KYC_SUBMITTED,
        entityType: 'Kyc',
        entityId: savedKyc.id,
        performedBy: userId,
        status: AuditStatus.SUCCESS,
        level: AuditLevel.SECURITY,
        metadata: { userId },
      });

      this.logger.log(`KYC submitted successfully for user ${userId}`);
      return savedKyc;
    } catch (error) {
      this.logger.error(`Failed to submit KYC for user ${userId}`, error);
      throw error;
    }
  }

  async getKycStatus(userId: string): Promise<Kyc | null> {
    try {
      const kyc = await this.kycRepository.findOne({ where: { userId } });

      if (kyc && kyc.encryptedKycData) {
        kyc.encryptedKycData = this.decryptKycData(
          userId,
          kyc.encryptedKycData,
        );
      }

      return kyc;
    } catch (error) {
      this.logger.error(`Failed to get KYC status for user ${userId}`, error);
      throw error;
    }
  }

  async handleWebhook(dto: KycWebhookDto): Promise<void> {
    const kyc = await this.kycRepository.findOne({
      where: { providerReference: dto.providerReference },
    });
    if (!kyc) return;
    kyc.status = dto.status;

    // Set expiry date when KYC is approved
    if (dto.status === KycStatus.APPROVED) {
      kyc.expiresAt = calculateKycExpiryDate();
      kyc.isExpired = false;
      kyc.needsReVerification = false;
    }

    await this.kycRepository.save(kyc);
    await this.userKycStatusService.setStatus(kyc.userId, dto.status);

    if (dto.status === KycStatus.APPROVED) {
      await this.notificationsService.notify(
        kyc.userId,
        'KYC approved',
        'Your identity verification has been approved.',
        'KYC_APPROVED',
      );
      return;
    }

    if (dto.status === KycStatus.REJECTED) {
      await this.notificationsService.notify(
        kyc.userId,
        'KYC rejected',
        'Your verification was rejected. Please review and resubmit.',
        'KYC_REJECTED',
      );
      return;
    }

    await this.notificationsService.notify(
      kyc.userId,
      'KYC status updated',
      `Your KYC status is now ${dto.status}.`,
      'KYC_UPDATED',
    );
  }

  private encryptKycData(
    userId: string,
    data: Record<string, unknown>,
  ): Record<string, unknown> {
    try {
      const encryptedData = encryptSensitiveKycFields(
        data,
        this.encryptionService,
      );

      const encryptedFields = Object.keys(data).filter(
        (field) => encryptedData[field] !== data[field],
      );

      void this.auditService.log({
        action: AuditAction.KYC_ENCRYPTED,
        entityType: 'Kyc',
        entityId: userId,
        performedBy: userId,
        status: AuditStatus.SUCCESS,
        level: AuditLevel.SECURITY,
        metadata: { userId, fieldsEncrypted: encryptedFields.length },
      });

      this.logger.debug('KYC data encrypted successfully');
      return encryptedData;
    } catch (error) {
      void this.auditService.log({
        action: AuditAction.KYC_ENCRYPTED,
        entityType: 'Kyc',
        entityId: userId,
        performedBy: userId,
        status: AuditStatus.FAILURE,
        level: AuditLevel.ERROR,
        errorMessage: error instanceof Error ? error.message : String(error),
        metadata: { userId },
      });
      this.logger.error('Failed to encrypt KYC data', error);
      throw error;
    }
  }

  private decryptKycData(
    userId: string,
    data: Record<string, unknown>,
  ): Record<string, unknown> {
    try {
      const decryptedData = decryptSensitiveKycFields(
        data,
        this.encryptionService,
      );

      const decryptedFields = Object.keys(data).filter(
        (field) => decryptedData[field] !== data[field],
      );

      void this.auditService.log({
        action: AuditAction.KYC_DECRYPTED,
        entityType: 'Kyc',
        entityId: userId,
        performedBy: userId,
        status: AuditStatus.SUCCESS,
        level: AuditLevel.SECURITY,
        metadata: { userId, fieldsDecrypted: decryptedFields.length },
      });

      this.logger.debug('KYC data decrypted successfully');
      return decryptedData;
    } catch (error) {
      void this.auditService.log({
        action: AuditAction.KYC_DECRYPTED,
        entityType: 'Kyc',
        entityId: userId,
        performedBy: userId,
        status: AuditStatus.FAILURE,
        level: AuditLevel.ERROR,
        errorMessage: error instanceof Error ? error.message : String(error),
        metadata: { userId },
      });
      this.logger.error('Failed to decrypt KYC data', error);
      throw error;
    }
  }
}
