import {
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';

@Injectable()
export class SmsGatewayService {
  private readonly logger = new Logger(SmsGatewayService.name);

  constructor(private readonly configService: ConfigService) {}

  async sendVerificationCode(phoneNumber: string, code: string): Promise<void> {
    const url = this.configService.get<string>('SMS_GATEWAY_URL');
    const apiKey = this.configService.get<string>('SMS_GATEWAY_API_KEY');
    if (!url || !apiKey) {
      throw new ServiceUnavailableException(
        'SMS fallback is not configured; set SMS_GATEWAY_URL and SMS_GATEWAY_API_KEY',
      );
    }

    try {
      await axios.post(
        url,
        {
          to: phoneNumber,
          message: `Your Arbitra verification code is ${code}. It expires in 5 minutes.`,
        },
        {
          timeout: 5000,
          headers: { Authorization: `Bearer ${apiKey}` },
        },
      );
    } catch (error) {
      this.logger.error(
        'SMS verification delivery failed',
        error instanceof Error ? error.stack : String(error),
      );
      throw new ServiceUnavailableException(
        'Unable to send SMS verification code',
      );
    }
  }
}
