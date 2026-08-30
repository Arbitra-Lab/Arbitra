import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ScheduleModule } from '@nestjs/schedule';
import { BullModule } from '@nestjs/bull';
import { KycModule } from './kyc.module';
import { Kyc } from './kyc.entity';
import { KycService } from './kyc.service';
import { KycExpiryService } from './kyc-expiry.service';
import { KycStatus } from './kyc-status.enum';
import { calculateKycExpiryDate } from './kyc-config';

/**
 * Integration tests for KYC re-verification and expiry functionality
 * Tests the full flow from KYC approval through expiry and re-verification
 */
describe('KYC Re-Verification and Expiry (Integration)', () => {
  let app: INestApplication;
  let kycService: KycService;
  let kycExpiryService: KycExpiryService;
  let kycRepository: any;

  const testUser = {
    id: 'test-user-123',
    email: 'test@example.com',
  };

  const submitKycDto = {
    kycData: {
      first_name: 'John',
      last_name: 'Doe',
      date_of_birth: '1990-01-01',
      address_country_code: 'US',
    },
  };

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [
        TypeOrmModule.forRoot({
          type: 'sqlite',
          database: ':memory:',
          entities: [Kyc],
          synchronize: true,
        }),
        TypeOrmModule.forFeature([Kyc]),
        ScheduleModule.forRoot(),
        BullModule.forRoot({
          redis: {
            host: 'localhost',
            port: 6379,
          },
        }),
        BullModule.registerQueue({ name: 'email' }),
        KycModule,
      ],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.useGlobalPipes(new ValidationPipe());
    await app.init();

    kycService = moduleFixture.get<KycService>(KycService);
    kycExpiryService = moduleFixture.get<KycExpiryService>(KycExpiryService);
    kycRepository = moduleFixture.get('KycRepository');
  });

  afterAll(async () => {
    await app.close();
  });

  describe('KYC Approval and Expiry Flow', () => {
    it('should set expiry date when KYC is approved', async () => {
      // Create initial KYC record
      const kyc = kycRepository.create({
        userId: testUser.id,
        status: KycStatus.PENDING,
        encryptedKycData: submitKycDto.kycData,
      });
      await kycRepository.save(kyc);

      // Simulate webhook approval
      const webhookDto = {
        providerReference: kyc.id,
        status: KycStatus.APPROVED,
      };

      await kycService.handleWebhook(webhookDto);

      // Verify expiry date was set
      const updatedKyc = await kycRepository.findOne({ where: { userId: testUser.id } });
      expect(updatedKyc.status).toBe(KycStatus.APPROVED);
      expect(updatedKyc.expiresAt).not.toBeNull();
      expect(updatedKyc.isExpired).toBe(false);
    });

    it('should calculate correct expiry offset', async () => {
      const kyc = kycRepository.create({
        userId: `user-${Math.random()}`,
        status: KycStatus.PENDING,
        encryptedKycData: submitKycDto.kycData,
      });
      await kycRepository.save(kyc);

      const webhookDto = {
        providerReference: kyc.id,
        status: KycStatus.APPROVED,
      };

      await kycService.handleWebhook(webhookDto);

      const updatedKyc = await kycRepository.findOne({ where: { userId: kyc.userId } });
      const expectedExpiry = calculateKycExpiryDate();

      const daysDiff = Math.floor(
        (updatedKyc.expiresAt.getTime() - expectedExpiry.getTime()) /
          (1000 * 60 * 60 * 24),
      );

      // Allow 1 day tolerance due to execution timing
      expect(Math.abs(daysDiff)).toBeLessThanOrEqual(1);
    });
  });

  describe('Re-verification Initiation', () => {
    it('should reset KYC status when re-verification is initiated', async () => {
      const userId = `user-${Math.random()}`;
      const kyc = kycRepository.create({
        userId,
        status: KycStatus.APPROVED,
        encryptedKycData: submitKycDto.kycData,
        expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
        isExpired: false,
        needsReVerification: false,
      });
      await kycRepository.save(kyc);

      // Initiate re-verification
      const result = await kycExpiryService.initiateReVerification(userId);

      expect(result.status).toBe(KycStatus.PENDING);
      expect(result.isExpired).toBe(false);
      expect(result.needsReVerification).toBe(false);
      expect(result.expiresAt).toBeNull();
    });

    it('should handle re-verification for missing KYC record', async () => {
      const nonExistentUserId = `user-${Math.random()}`;

      await expect(
        kycExpiryService.initiateReVerification(nonExistentUserId),
      ).rejects.toThrow('KYC record not found');
    });
  });

  describe('Expiry Info Retrieval', () => {
    it('should calculate days until expiry correctly', async () => {
      const userId = `user-${Math.random()}`;
      const expiryDate = new Date();
      expiryDate.setDate(expiryDate.getDate() + 15); // 15 days from now

      const kyc = kycRepository.create({
        userId,
        status: KycStatus.APPROVED,
        encryptedKycData: submitKycDto.kycData,
        expiresAt: expiryDate,
        isExpired: false,
      });
      await kycRepository.save(kyc);

      const expiryInfo = await kycExpiryService.getKycExpiryInfo(userId);

      expect(expiryInfo.expiresAt).not.toBeNull();
      expect(expiryInfo.isExpired).toBe(false);
      expect(expiryInfo.daysUntilExpiry).toBe(15);
    });

    it('should return null daysUntilExpiry for expired records', async () => {
      const userId = `user-${Math.random()}`;
      const kyc = kycRepository.create({
        userId,
        status: KycStatus.APPROVED,
        encryptedKycData: submitKycDto.kycData,
        expiresAt: new Date(Date.now() - 1000),
        isExpired: true,
      });
      await kycRepository.save(kyc);

      const expiryInfo = await kycExpiryService.getKycExpiryInfo(userId);

      expect(expiryInfo.isExpired).toBe(true);
      expect(expiryInfo.daysUntilExpiry).toBeNull();
    });

    it('should return default values for users without KYC', async () => {
      const nonExistentUserId = `user-${Math.random()}`;

      const expiryInfo = await kycExpiryService.getKycExpiryInfo(nonExistentUserId);

      expect(expiryInfo.expiresAt).toBeNull();
      expect(expiryInfo.isExpired).toBe(false);
      expect(expiryInfo.needsReVerification).toBe(false);
      expect(expiryInfo.daysUntilExpiry).toBeNull();
    });
  });

  describe('Workflow Scenarios', () => {
    it('should handle complete workflow: submit -> approve -> expiry info -> re-verify', async () => {
      const userId = `user-${Math.random()}`;

      // 1. Submit KYC
      const kyc = kycRepository.create({
        userId,
        status: KycStatus.PENDING,
        encryptedKycData: submitKycDto.kycData,
      });
      await kycRepository.save(kyc);

      // 2. Approve KYC via webhook
      const webhookDto = {
        providerReference: kyc.id,
        status: KycStatus.APPROVED,
      };
      await kycService.handleWebhook(webhookDto);

      // 3. Check expiry info
      let expiryInfo = await kycExpiryService.getKycExpiryInfo(userId);
      expect(expiryInfo.isExpired).toBe(false);
      expect(expiryInfo.expiresAt).not.toBeNull();
      expect(expiryInfo.daysUntilExpiry).toBeGreaterThan(0);

      // 4. Initiate re-verification
      const reVerifyResult = await kycExpiryService.initiateReVerification(userId);
      expect(reVerifyResult.status).toBe(KycStatus.PENDING);

      // 5. Verify status reset
      expiryInfo = await kycExpiryService.getKycExpiryInfo(userId);
      expect(expiryInfo.expiresAt).toBeNull();
    });
  });
});
