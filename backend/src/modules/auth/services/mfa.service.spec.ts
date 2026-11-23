import * as speakeasy from 'speakeasy';
import * as qrcode from 'qrcode';
import { ConfigService } from '@nestjs/config';
import { UnauthorizedException } from '@nestjs/common';
import { MfaService } from './mfa.service';
import {
  MfaDevice,
  MfaDeviceStatus,
  MfaDeviceType,
} from '../entities/mfa-device.entity';

describe('MfaService setup', () => {
  const user = {
    id: 'user-id',
    email: 'user@example.com',
    phoneNumber: '+12345678901',
    twoFactorEnabled: false,
  };
  const userRepository = {
    findOne: jest.fn(),
    update: jest.fn(),
  };
  const deviceRepository = {
    findOne: jest.fn(),
    update: jest.fn(),
    create: jest.fn((device) => device),
    save: jest.fn((device) => device),
  };
  const configService = {
    get: jest.fn().mockReturnValue('a'.repeat(64)),
  } as unknown as ConfigService;
  let service: MfaService;
  let totpVerify: jest.SpyInstance;
  const smsGateway = { sendVerificationCode: jest.fn() };

  beforeEach(() => {
    jest.clearAllMocks();
    service = new MfaService(
      deviceRepository as never,
      userRepository as never,
      configService,
      {} as never,
      smsGateway as never,
    );
    totpVerify = jest.spyOn(speakeasy.totp, 'verify');
    userRepository.findOne.mockResolvedValue(user);
    smsGateway.sendVerificationCode.mockResolvedValue(undefined);
    deviceRepository.findOne.mockResolvedValue(null);
    deviceRepository.update.mockResolvedValue({ affected: 0 });
    deviceRepository.save.mockImplementation((device) => device);
    jest.spyOn(speakeasy, 'generateSecret').mockReturnValue({
      base32: 'BASE32SECRET',
      otpauth_url: 'otpauth://totp/test',
    } as ReturnType<typeof speakeasy.generateSecret>);
    jest
      .spyOn(qrcode, 'toDataURL')
      .mockResolvedValue('data:image/png;base64,qr');
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  it('keeps new TOTP enrollment pending until its first code is verified', async () => {
    const setup = await service.generateMfaSecret(user.id);
    const pending = deviceRepository.save.mock.calls[0][0] as MfaDevice;

    expect(setup.secret).toBe('BASE32SECRET');
    expect(setup.backupCodes).toHaveLength(10);
    expect(pending.status).toBe(MfaDeviceStatus.PENDING);
    expect(pending.secretKey).toMatch(/^gcm:/);

    deviceRepository.findOne.mockResolvedValue(pending);
    totpVerify.mockImplementation(
      (options: { secret: string }) => options.secret === 'BASE32SECRET',
    );
    await service.verifyMfaSetup(user.id, '123456');

    expect(totpVerify).toHaveBeenCalledWith(
      expect.objectContaining({ secret: 'BASE32SECRET' }),
    );
    expect(pending.status).toBe(MfaDeviceStatus.ACTIVE);
    expect(userRepository.update).toHaveBeenCalledWith(user.id, {
      twoFactorEnabled: true,
    });
  });

  it('does not activate setup when the initial code is invalid', async () => {
    const setup = await service.generateMfaSecret(user.id);
    const pending = deviceRepository.save.mock.calls[0][0] as MfaDevice;
    deviceRepository.findOne.mockResolvedValue(pending);
    totpVerify.mockReturnValue(false);

    await expect(
      service.verifyMfaSetup(user.id, '000000'),
    ).rejects.toBeInstanceOf(UnauthorizedException);
    expect(pending.status).toBe(MfaDeviceStatus.PENDING);
    expect(userRepository.update).not.toHaveBeenCalled();
    expect(setup.secret).toBeDefined();
  });

  it('supports verified SMS fallback setup and consumes login codes once', async () => {
    const setup = await service.generateSmsSetup(user.id);
    const pending = deviceRepository.save.mock.calls[0][0] as MfaDevice;
    const setupCode = smsGateway.sendVerificationCode.mock
      .calls[0][1] as string;

    expect(setup.method).toBe('sms');
    expect(pending.type).toBe(MfaDeviceType.SMS);
    expect(pending.status).toBe(MfaDeviceStatus.PENDING);
    expect(smsGateway.sendVerificationCode).toHaveBeenCalledWith(
      user.phoneNumber,
      setupCode,
    );

    pending.createdAt = new Date();
    deviceRepository.findOne
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(pending);
    await service.verifyMfaSetup(user.id, setupCode);
    expect(pending.status).toBe(MfaDeviceStatus.ACTIVE);

    pending.updatedAt = new Date();
    deviceRepository.findOne.mockResolvedValueOnce(pending);
    await service.sendSmsLoginCode(user.id);
    const loginCode = smsGateway.sendVerificationCode.mock
      .calls[1][1] as string;
    expect(smsGateway.sendVerificationCode).toHaveBeenLastCalledWith(
      user.phoneNumber,
      loginCode,
    );

    pending.updatedAt = new Date();
    deviceRepository.findOne
      .mockResolvedValueOnce(null)
      .mockResolvedValueOnce(pending);
    await expect(service.verifyMfaLoginCode(user.id, loginCode)).resolves.toBe(
      true,
    );
    await expect(service.verifyMfaLoginCode(user.id, loginCode)).resolves.toBe(
      false,
    );
  });
});
