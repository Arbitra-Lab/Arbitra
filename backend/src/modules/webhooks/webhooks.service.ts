import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { ConfigService } from '@nestjs/config';
import { Cron, CronExpression } from '@nestjs/schedule';
import { LessThanOrEqual, Repository, In } from 'typeorm';
import * as crypto from 'crypto';
import axios from 'axios';
import { WebhookEndpoint } from './entities/webhook-endpoint.entity';
import { WebhookDelivery } from './entities/webhook-delivery.entity';
import {
  WebhookEvent,
  WEBHOOK_MAX_DELIVERY_ATTEMPTS,
  computeWebhookBackoffMs,
} from './webhook-event';
import { WebhookSignatureService } from './webhook-signature.service';

@Injectable()
export class WebhooksService {
  private readonly logger = new Logger(WebhooksService.name);

  constructor(
    @InjectRepository(WebhookEndpoint)
    private readonly endpointRepository: Repository<WebhookEndpoint>,
    @InjectRepository(WebhookDelivery)
    private readonly deliveryRepository: Repository<WebhookDelivery>,
    private readonly configService: ConfigService,
    private readonly webhookSignatureService: WebhookSignatureService,
  ) {}

  async dispatchEvent(
    event: WebhookEvent,
    payload: Record<string, unknown>,
  ): Promise<void> {
    const endpoints = await this.endpointRepository.find({
      where: {
        isActive: true,
      },
    });

    const matchingEndpoints = endpoints.filter((endpoint) =>
      endpoint.events.includes(event),
    );

    await Promise.all(
      matchingEndpoints.map((endpoint) =>
        this.deliverEvent(endpoint, event, payload),
      ),
    );
  }

  /**
   * First delivery attempt for a newly dispatched event. Creates the
   * durable delivery attempt log record, then hands off to the shared
   * send/record path used by retries and DLQ replays.
   */
  async deliverEvent(
    endpoint: WebhookEndpoint,
    event: WebhookEvent,
    payload: Record<string, unknown>,
  ): Promise<WebhookDelivery> {
    const requestPayload = JSON.stringify({
      event,
      timestamp: new Date().toISOString(),
      data: payload,
    });

    const delivery = this.deliveryRepository.create({
      endpointId: endpoint.id,
      event,
      payload: JSON.parse(requestPayload) as Record<string, unknown>,
      payloadHash: this.hashPayload(requestPayload),
      status: 'pending',
      successful: false,
      attemptCount: 1,
    });

    return this.sendAndRecord(endpoint, delivery);
  }

  /**
   * Re-attempts a delivery that is currently in `retrying` state and due
   * (nextRetryAt has elapsed). No-op (returns the record unchanged) if the
   * delivery is not actually due for retry.
   */
  async retryDelivery(deliveryId: string): Promise<WebhookDelivery> {
    const delivery = await this.deliveryRepository.findOne({
      where: { id: deliveryId },
    });
    if (!delivery) {
      throw new NotFoundException(`Webhook delivery ${deliveryId} not found`);
    }
    if (delivery.status !== 'retrying') {
      return delivery;
    }

    const endpoint = await this.endpointRepository.findOne({
      where: { id: delivery.endpointId },
    });
    if (!endpoint) {
      delivery.status = 'dead_letter';
      delivery.deadLetteredAt = new Date();
      delivery.nextRetryAt = null;
      this.logger.error(
        `Webhook delivery ${delivery.id} moved to dead-letter: endpoint ${delivery.endpointId} no longer exists`,
      );
      return this.deliveryRepository.save(delivery);
    }

    delivery.attemptCount += 1;
    return this.sendAndRecord(endpoint, delivery);
  }

  /**
   * Sweeps for deliveries whose backoff window has elapsed and retries
   * each of them. Intended to run on a schedule; also callable directly
   * (e.g. from tests or an operator tool) with an explicit `now`.
   */
  async processDueRetries(now: Date = new Date()): Promise<WebhookDelivery[]> {
    const due = await this.deliveryRepository.find({
      where: {
        status: 'retrying',
        nextRetryAt: LessThanOrEqual(now),
      },
    });

    const results: WebhookDelivery[] = [];
    for (const delivery of due) {
      try {
        results.push(await this.retryDelivery(delivery.id));
      } catch (error) {
        this.logger.error(
          `Failed to process retry for delivery ${delivery.id}: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    }
    return results;
  }

  @Cron(CronExpression.EVERY_MINUTE)
  async scheduledRetrySweep(): Promise<void> {
    await this.processDueRetries();
  }

  /**
   * Operator-triggered replay of a dead-lettered delivery. Reuses the
   * existing delivery row (same event record) rather than creating a new
   * one, so replays never duplicate the original event.
   */
  async replayDeadLetter(deliveryId: string): Promise<WebhookDelivery> {
    const delivery = await this.deliveryRepository.findOne({
      where: { id: deliveryId },
    });
    if (!delivery) {
      throw new NotFoundException(`Webhook delivery ${deliveryId} not found`);
    }
    if (delivery.status !== 'dead_letter') {
      throw new BadRequestException(
        `Webhook delivery ${deliveryId} is not in the dead-letter queue`,
      );
    }

    const endpoint = await this.endpointRepository.findOne({
      where: { id: delivery.endpointId },
    });
    if (!endpoint) {
      throw new NotFoundException(
        `Webhook endpoint ${delivery.endpointId} not found`,
      );
    }

    delivery.status = 'pending';
    delivery.deadLetteredAt = null;
    delivery.nextRetryAt = null;
    delivery.attemptCount += 1;

    this.logger.log(
      `Replaying dead-lettered webhook delivery ${delivery.id} (attempt ${delivery.attemptCount})`,
    );

    return this.sendAndRecord(endpoint, delivery);
  }

  async findEndpoints(ids: string[]): Promise<WebhookEndpoint[]> {
    return this.endpointRepository.find({
      where: {
        id: In(ids),
      },
    });
  }

  /**
   * Sends the HTTP request for `delivery`, then records the outcome:
   * success, a scheduled retry with exponential backoff + jitter, or a
   * transition to the dead-letter queue once the attempt ceiling is hit.
   */
  private async sendAndRecord(
    endpoint: WebhookEndpoint,
    delivery: WebhookDelivery,
  ): Promise<WebhookDelivery> {
    const requestPayload = JSON.stringify(delivery.payload);
    const secret =
      endpoint.secret ||
      this.configService.get<string>('WEBHOOK_SIGNATURE_SECRET') ||
      '';

    delivery.payloadHash = this.hashPayload(requestPayload);
    const headers = this.webhookSignatureService.createSignedHeaders(
      requestPayload,
      secret,
    );
    delivery.nonce = headers['X-Webhook-Nonce'];

    try {
      const response = await axios.post(endpoint.url, requestPayload, {
        headers,
        timeout: 10000,
      });

      delivery.successful = true;
      delivery.status = 'delivered';
      delivery.responseStatus = response.status;
      delivery.responseBody =
        typeof response.data === 'string'
          ? response.data
          : JSON.stringify(response.data);
      delivery.deliveredAt = new Date();
      delivery.nextRetryAt = null;
    } catch (error) {
      const response = axios.isAxiosError(error) ? error.response : undefined;
      delivery.successful = false;
      delivery.responseStatus = response?.status;
      delivery.responseBody =
        typeof response?.data === 'string'
          ? response.data
          : response?.data
            ? JSON.stringify(response.data)
            : error instanceof Error
              ? error.message
              : 'Unknown webhook delivery error';

      if (delivery.attemptCount >= WEBHOOK_MAX_DELIVERY_ATTEMPTS) {
        delivery.status = 'dead_letter';
        delivery.deadLetteredAt = new Date();
        delivery.nextRetryAt = null;
        this.logger.error(
          `Webhook delivery to endpoint ${endpoint.id} moved to dead-letter after ${delivery.attemptCount} attempts: ${delivery.responseBody}`,
        );
      } else {
        delivery.status = 'retrying';
        const delayMs = computeWebhookBackoffMs(delivery.attemptCount);
        delivery.nextRetryAt = new Date(Date.now() + delayMs);
        this.logger.warn(
          `Webhook delivery failed for endpoint ${endpoint.id} (attempt ${delivery.attemptCount}): ${delivery.responseBody}. Retrying at ${delivery.nextRetryAt.toISOString()}`,
        );
      }
    }

    return this.deliveryRepository.save(delivery);
  }

  private hashPayload(payload: string): string {
    return crypto.createHash('sha256').update(payload).digest('hex');
  }
}
