import axios from 'axios';
import { ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SmsGatewayService } from './sms-gateway.service';

describe('SmsGatewayService', () => {
  afterEach(() => jest.restoreAllMocks());

  it('sends verification codes through the configured gateway', async () => {
    const config = {
      get: jest.fn((key: string) =>
        key === 'SMS_GATEWAY_URL'
          ? 'https://sms.example.test/messages'
          : 'gateway-key',
      ),
    } as unknown as ConfigService;
    const post = jest.spyOn(axios, 'post').mockResolvedValue({} as never);

    await new SmsGatewayService(config).sendVerificationCode(
      '+15551234567',
      '123456',
    );

    expect(post).toHaveBeenCalledWith(
      'https://sms.example.test/messages',
      expect.objectContaining({
        to: '+15551234567',
        message: expect.stringContaining('123456'),
      }),
      expect.objectContaining({
        headers: { Authorization: 'Bearer gateway-key' },
      }),
    );
  });

  it('fails explicitly when the SMS gateway is not configured', async () => {
    const config = {
      get: jest.fn().mockReturnValue(undefined),
    } as unknown as ConfigService;

    await expect(
      new SmsGatewayService(config).sendVerificationCode(
        '+15551234567',
        '123456',
      ),
    ).rejects.toBeInstanceOf(ServiceUnavailableException);
  });
});
