import {
  Injectable,
  BadRequestException,
  UnauthorizedException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import * as speakeasy from 'speakeasy';
import * as qrcode from 'qrcode';
import * as crypto from 'crypto';
import * as bcrypt from 'bcryptjs';
import { ConfigService } from '@nestjs/config';
import { User } from '../../users/entities/user.entity';
import {
  MfaDevice,
  MfaDeviceType,
  MfaDeviceStatus,
} from '../entities/mfa-device.entity';
import {
  AuthSuccessResponseDto,
  MfaRequiredResponseDto,
} from '../dto/auth-response.dto';
import { AuthService } from '../auth.service';
import { JwtService } from '@nestjs/jwt';
import { SmsGatewayService } from '../../notifications/sms-gateway.service';

@Injectable()
export class MfaService {
  private readonly logger = new Logger(MfaService.name);
  private readonly encryptionKey: string;

  constructor(
    @InjectRepository(MfaDevice)
    private mfaDeviceRepository: Repository<MfaDevice>,
    @InjectRepository(User)
    private userRepository: Repository<User>,
    private configService: ConfigService,
    private jwtService: JwtService,
    private smsGatewayService: SmsGatewayService,
  ) {
    const key = this.configService.get<string>('SECURITY_ENCRYPTION_KEY');
    if (!key) {
      throw new Error('SECURITY_ENCRYPTION_KEY is required');
    }
    this.encryptionKey = key;
  }

  /**
   * Generate TOTP secret and QR code for a user
   */
  async generateMfaSecret(
    userId: string,
    deviceName?: string,
  ): Promise<{
    secret: string;
    qrCodeUrl: string;
    backupCodes: string[];
  }> {
    const user = await this.userRepository.findOne({ where: { id: userId } });
    if (!user) {
      throw new BadRequestException('User not found');
    }

    // Check if user already has an active MFA device
    const existingDevice = await this.mfaDeviceRepository.findOne({
      where: {
        userId,
        type: MfaDeviceType.TOTP,
        status: MfaDeviceStatus.ACTIVE,
      },
    });

    if (existingDevice) {
      throw new BadRequestException('MFA is already enabled for this user');
    }

    await this.mfaDeviceRepository.update(
      { userId, type: MfaDeviceType.TOTP, status: MfaDeviceStatus.PENDING },
      { status: MfaDeviceStatus.DISABLED },
    );

    // Generate TOTP secret
    const secret = speakeasy.generateSecret({
      name: `Arbitra (${user.email})`,
      length: 32,
    });

    // Encrypt the secret before storing
    const encryptedSecret = this.encryptSecret(secret.base32);

    // Generate backup codes
    const backupCodes = this.generateBackupCodes();
    const hashedBackupCodes = await Promise.all(
      backupCodes.map((code) => bcrypt.hash(code, 10)),
    );

    // Create MFA device
    const mfaDevice = this.mfaDeviceRepository.create({
      userId,
      type: MfaDeviceType.TOTP,
      status: MfaDeviceStatus.PENDING,
      deviceName: deviceName || 'Authenticator App',
      secretKey: encryptedSecret,
      backupCodes: JSON.stringify(hashedBackupCodes),
    });

    await this.mfaDeviceRepository.save(mfaDevice);

    // Generate QR code
    const qrCodeUrl = await qrcode.toDataURL(secret.otpauth_url || '');

    this.logger.log(`MFA secret generated for user: ${userId}`);

    return {
      secret: secret.base32,
      qrCodeUrl,
      backupCodes,
    };
  }

  async verifyMfaSetup(userId: string, token: string): Promise<void> {
    const totpDevice = await this.mfaDeviceRepository.findOne({
      where: {
        userId,
        type: MfaDeviceType.TOTP,
        status: MfaDeviceStatus.PENDING,
      },
    });

    if (totpDevice?.secretKey) {
      const secret = this.decryptSecret(totpDevice.secretKey);
      const verified = speakeasy.totp.verify({
        secret,
        encoding: 'base32',
        token,
        window: 1,
      });
      if (!verified) {
        throw new UnauthorizedException('Invalid MFA setup code');
      }

      await this.activateDevice(totpDevice);
      return;
    }

    const smsDevice = await this.mfaDeviceRepository.findOne({
      where: {
        userId,
        type: MfaDeviceType.SMS,
        status: MfaDeviceStatus.PENDING,
      },
    });
    const user = await this.userRepository.findOne({ where: { id: userId } });
    if (
      !smsDevice?.secretKey ||
      !smsDevice.createdAt ||
      Date.now() - smsDevice.createdAt.getTime() > 5 * 60 * 1000 ||
      !user?.phoneNumber ||
      smsDevice.deviceName !== this.phoneFingerprint(user.phoneNumber) ||
      !(await bcrypt.compare(token, smsDevice.secretKey))
    ) {
      throw new UnauthorizedException('Invalid MFA setup code');
    }

    smsDevice.secretKey = null;
    await this.activateDevice(smsDevice);
  }

  private async activateDevice(device: MfaDevice): Promise<void> {
    await this.mfaDeviceRepository.update(
      {
        userId: device.userId,
        type: device.type,
        status: MfaDeviceStatus.ACTIVE,
      },
      { status: MfaDeviceStatus.DISABLED },
    );
    device.status = MfaDeviceStatus.ACTIVE;
    device.lastUsedAt = new Date();
    await this.mfaDeviceRepository.save(device);
    await this.userRepository.update(device.userId, { twoFactorEnabled: true });
  }

  async generateSmsSetup(
    userId: string,
  ): Promise<{ method: 'sms'; message: string }> {
    const user = await this.userRepository.findOne({ where: { id: userId } });
    if (!user?.phoneNumber || !/^\+[1-9]\d{7,14}$/.test(user.phoneNumber)) {
      throw new BadRequestException(
        'Add a valid E.164 phone number before enabling SMS fallback',
      );
    }

    const activeDevice = await this.mfaDeviceRepository.findOne({
      where: {
        userId,
        type: MfaDeviceType.SMS,
        status: MfaDeviceStatus.ACTIVE,
      },
    });
    if (activeDevice) {
      throw new BadRequestException('SMS MFA is already enabled');
    }

    await this.mfaDeviceRepository.update(
      { userId, type: MfaDeviceType.SMS, status: MfaDeviceStatus.PENDING },
      { status: MfaDeviceStatus.DISABLED },
    );
    const code = crypto.randomInt(100000, 1000000).toString();
    const device = this.mfaDeviceRepository.create({
      userId,
      type: MfaDeviceType.SMS,
      status: MfaDeviceStatus.PENDING,
      deviceName: this.phoneFingerprint(user.phoneNumber),
      secretKey: await bcrypt.hash(code, 10),
    });
    await this.mfaDeviceRepository.save(device);
    await this.smsGatewayService.sendVerificationCode(user.phoneNumber, code);
    return { method: 'sms', message: 'Verification code sent' };
  }

  async sendSmsLoginCode(userId: string): Promise<void> {
    const [user, device] = await Promise.all([
      this.userRepository.findOne({ where: { id: userId } }),
      this.mfaDeviceRepository.findOne({
        where: {
          userId,
          type: MfaDeviceType.SMS,
          status: MfaDeviceStatus.ACTIVE,
        },
      }),
    ]);
    if (!user?.phoneNumber || !device) {
      throw new UnauthorizedException('SMS MFA is not enabled for this user');
    }
    if (device.deviceName !== this.phoneFingerprint(user.phoneNumber)) {
      throw new UnauthorizedException(
        'Phone number changed; re-enroll SMS MFA before using it',
      );
    }

    const code = crypto.randomInt(100000, 1000000).toString();
    device.secretKey = await bcrypt.hash(code, 10);
    await this.mfaDeviceRepository.save(device);
    await this.smsGatewayService.sendVerificationCode(user.phoneNumber, code);
  }

  private phoneFingerprint(phoneNumber: string): string {
    return crypto
      .createHmac('sha256', this.encryptionKey)
      .update(phoneNumber)
      .digest('hex');
  }

  async verifyMfaLoginCode(userId: string, token: string): Promise<boolean> {
    const totpDevice = await this.mfaDeviceRepository.findOne({
      where: {
        userId,
        type: MfaDeviceType.TOTP,
        status: MfaDeviceStatus.ACTIVE,
      },
    });
    if (totpDevice?.secretKey) {
      const secret = this.decryptSecret(totpDevice.secretKey);
      if (
        speakeasy.totp.verify({
          secret,
          encoding: 'base32',
          token,
          window: 2,
        })
      ) {
        totpDevice.lastUsedAt = new Date();
        await this.mfaDeviceRepository.save(totpDevice);
        return true;
      }
      if (await this.consumeBackupCode(totpDevice, token)) return true;
    }

    const smsDevice = await this.mfaDeviceRepository.findOne({
      where: {
        userId,
        type: MfaDeviceType.SMS,
        status: MfaDeviceStatus.ACTIVE,
      },
    });
    if (
      !smsDevice?.secretKey ||
      !smsDevice.updatedAt ||
      Date.now() - smsDevice.updatedAt.getTime() > 5 * 60 * 1000 ||
      !(await bcrypt.compare(token, smsDevice.secretKey))
    ) {
      return false;
    }
    smsDevice.secretKey = null;
    smsDevice.lastUsedAt = new Date();
    await this.mfaDeviceRepository.save(smsDevice);
    return true;
  }

  private async consumeBackupCode(
    device: MfaDevice,
    code: string,
  ): Promise<boolean> {
    if (!device.backupCodes) return false;
    const hashedCodes: string[] = JSON.parse(device.backupCodes) as string[];
    for (let index = 0; index < hashedCodes.length; index++) {
      if (await bcrypt.compare(code, hashedCodes[index])) {
        hashedCodes.splice(index, 1);
        device.backupCodes =
          hashedCodes.length > 0 ? JSON.stringify(hashedCodes) : null;
        await this.mfaDeviceRepository.save(device);
        return true;
      }
    }
    return false;
  }

  /**
   * Verify TOTP token by user ID
   */
  async verifyTotpToken(userId: string, token: string): Promise<boolean> {
    const device = await this.mfaDeviceRepository.findOne({
      where: {
        userId,
        type: MfaDeviceType.TOTP,
        status: MfaDeviceStatus.ACTIVE,
      },
    });

    if (!device || !device.secretKey) {
      throw new UnauthorizedException('MFA not enabled for this user');
    }

    // Decrypt the secret
    const secret = this.decryptSecret(device.secretKey);

    // Verify the token
    const verified = speakeasy.totp.verify({
      secret,
      encoding: 'base32',
      token,
      window: 2, // Allow 2 time steps (60 seconds) of tolerance
    });

    if (verified) {
      device.lastUsedAt = new Date();
      await this.mfaDeviceRepository.save(device);
      this.logger.log(`MFA token verified for user: ${userId}`);
    }

    return verified;
  }

  /**
   * Verify TOTP token by MFA token (extracts userId from token)
   */
  verifyTotpTokenByMfaToken(
    _mfaToken: string,
    _token: string,
  ): Promise<{ userId: string; isValid: boolean }> {
    void _mfaToken;
    void _token;
    // This will be called from controller with decoded token
    return Promise.reject(new Error('Use verifyTotpToken with userId instead'));
  }

  /**
   * Verify backup code by user ID
   */
  async verifyBackupCode(userId: string, code: string): Promise<boolean> {
    const device = await this.mfaDeviceRepository.findOne({
      where: {
        userId,
        type: MfaDeviceType.TOTP,
        status: MfaDeviceStatus.ACTIVE,
      },
    });

    if (!device || !device.backupCodes) {
      throw new UnauthorizedException('MFA not enabled for this user');
    }

    const hashedCodes: string[] = JSON.parse(device.backupCodes) as string[];

    // Check if code matches any backup code
    for (let i = 0; i < hashedCodes.length; i++) {
      const isValid = await bcrypt.compare(code, hashedCodes[i]);
      if (isValid) {
        // Remove used backup code
        hashedCodes.splice(i, 1);
        device.backupCodes =
          hashedCodes.length > 0 ? JSON.stringify(hashedCodes) : null;
        await this.mfaDeviceRepository.save(device);
        this.logger.log(`Backup code used for user: ${userId}`);
        return true;
      }
    }

    return false;
  }

  /**
   * Check if user has MFA enabled
   */
  async isMfaEnabled(userId: string): Promise<boolean> {
    const [totp, sms] = await Promise.all([
      this.mfaDeviceRepository.findOne({
        where: {
          userId,
          type: MfaDeviceType.TOTP,
          status: MfaDeviceStatus.ACTIVE,
        },
      }),
      this.mfaDeviceRepository.findOne({
        where: {
          userId,
          type: MfaDeviceType.SMS,
          status: MfaDeviceStatus.ACTIVE,
        },
      }),
    ]);
    return Boolean(totp || sms);
  }

  /**
   * Disable MFA for a user
   */
  async disableMfa(userId: string): Promise<void> {
    const devices = await this.mfaDeviceRepository.find({
      where: {
        userId,
        status: MfaDeviceStatus.ACTIVE,
      },
    });

    for (const device of devices) {
      device.status = MfaDeviceStatus.DISABLED;
      await this.mfaDeviceRepository.save(device);
    }

    await this.userRepository.update(userId, { twoFactorEnabled: false });

    this.logger.log(`MFA disabled for user: ${userId}`);
  }

  /**
   * Generate new backup codes
   */
  async regenerateBackupCodes(userId: string): Promise<string[]> {
    const device = await this.mfaDeviceRepository.findOne({
      where: {
        userId,
        type: MfaDeviceType.TOTP,
        status: MfaDeviceStatus.ACTIVE,
      },
    });

    if (!device) {
      throw new BadRequestException('MFA not enabled for this user');
    }

    const backupCodes = this.generateBackupCodes();
    const hashedBackupCodes = await Promise.all(
      backupCodes.map((code) => bcrypt.hash(code, 10)),
    );

    device.backupCodes = JSON.stringify(hashedBackupCodes);
    await this.mfaDeviceRepository.save(device);

    this.logger.log(`Backup codes regenerated for user: ${userId}`);

    return backupCodes;
  }

  /**
   * Generate backup codes
   */
  private generateBackupCodes(count: number = 10): string[] {
    const codes: string[] = [];
    for (let i = 0; i < count; i++) {
      const code = crypto.randomBytes(4).toString('hex').toUpperCase();
      codes.push(code);
    }
    return codes;
  }

  /**
   * Encrypt secret key
   */
  private encryptSecret(secret: string): string {
    const key = crypto.createHash('sha256').update(this.encryptionKey).digest();
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
    const encrypted = Buffer.concat([
      cipher.update(secret, 'utf8'),
      cipher.final(),
    ]);
    return `gcm:${iv.toString('hex')}:${cipher.getAuthTag().toString('hex')}:${encrypted.toString('hex')}`;
  }

  /**
   * Decrypt secret key
   */
  private decryptSecret(encryptedSecret: string): string {
    const key = crypto.createHash('sha256').update(this.encryptionKey).digest();
    const parts = encryptedSecret.split(':');
    if (parts[0] === 'gcm') {
      if (parts.length !== 4) {
        throw new UnauthorizedException('Stored MFA secret is invalid');
      }
      const decipher = crypto.createDecipheriv(
        'aes-256-gcm',
        key,
        Buffer.from(parts[1], 'hex'),
      );
      decipher.setAuthTag(Buffer.from(parts[2], 'hex'));
      return Buffer.concat([
        decipher.update(Buffer.from(parts[3], 'hex')),
        decipher.final(),
      ]).toString('utf8');
    }

    // Retain compatibility with MFA secrets written before authenticated encryption.
    const algorithm = 'aes-256-cbc';
    const iv = Buffer.from(parts[0], 'hex');
    const encrypted = parts[1];
    const decipher = crypto.createDecipheriv(algorithm, key, iv);
    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    return decrypted;
  }

  /**
   * Verify MFA token during login flow
   *
   * @param mfaToken
   * @param authService
   * @returns
   */
  async verifyMfaToken(
    mfaToken: string,
    authService: AuthService,
  ): Promise<AuthSuccessResponseDto> {
    try {
      // Verify temporary MFA token
      const payload = this.jwtService.verify<{
        sub: string;
        email: string;
        role: string;
        type: string;
      }>(mfaToken, {
        secret: authService.getJwtSecret(),
      });

      if (payload.type !== 'mfa_required') {
        throw new UnauthorizedException('Invalid token type');
      }

      const user = await this.userRepository.findOne({
        where: { id: payload.sub },
      });

      if (!user) {
        throw new UnauthorizedException('User not found');
      }

      // Generate final tokens
      const { accessToken, refreshToken } = authService.generateTokens(
        user.id,
        user.email,
        user.role,
        true,
      );

      await authService.updateRefreshToken(user.id, refreshToken);

      this.logger.log(`MFA login completed for user: ${user.id}`);

      return {
        user: authService.sanitizeUser(user),
        accessToken,
        refreshToken,
        mfaRequired: false,
      };
    } catch (error: unknown) {
      const message =
        error instanceof Error ? error.message : 'Invalid or expired MFA token';
      this.logger.error(`MFA login failed: ${message}`);
      throw new UnauthorizedException('Invalid or expired MFA token');
    }
  }
  async generateMfaToken(
    user: User,
    authService: AuthService,
  ): Promise<MfaRequiredResponseDto> {
    // Generate temporary token for MFA verification
    const tempToken = this.jwtService.sign(
      {
        sub: user.id,
        email: user.email,
        role: user.role,
        type: 'mfa_required',
      },
      {
        secret: authService.getJwtSecret(),
        expiresIn: '5m', // Short-lived token for MFA verification
      },
    );

    this.logger.log(`MFA required for user: ${user.id}`);
    const mfaResponse: MfaRequiredResponseDto = {
      user: authService.sanitizeUser(user),
      mfaRequired: true,
      mfaToken: tempToken,
    };

    return mfaResponse;
  }

  async checkMfaRequired(userId: string) {
    const [totp, sms] = await Promise.all([
      this.mfaDeviceRepository.findOne({
        where: {
          userId,
          type: MfaDeviceType.TOTP,
          status: MfaDeviceStatus.ACTIVE,
        },
      }),
      this.mfaDeviceRepository.findOne({
        where: {
          userId,
          type: MfaDeviceType.SMS,
          status: MfaDeviceStatus.ACTIVE,
        },
      }),
    ]);
    return totp ?? sms;
  }
}
