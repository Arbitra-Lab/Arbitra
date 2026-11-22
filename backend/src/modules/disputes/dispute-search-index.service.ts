import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Dispute } from './entities/dispute.entity';

@Injectable()
export class DisputeSearchIndexService {
  private readonly logger = new Logger(DisputeSearchIndexService.name);
  private readonly node: string;
  private readonly index: string;
  private readonly enabled: boolean;

  constructor(private readonly config: ConfigService) {
    this.node = (this.config.get<string>('ELASTICSEARCH_NODE') || '').replace(/\/$/, '');
    this.index = this.config.get<string>('ELASTICSEARCH_DISPUTES_INDEX') || 'arbitra-disputes';
    this.enabled = !!this.node;
  }

  isEnabled(): boolean {
    return this.enabled;
  }

  async indexDispute(dispute: Dispute): Promise<void> {
    if (!this.enabled) return;
    try {
      await fetch(`${this.node}/${this.index}/_doc/${encodeURIComponent(dispute.disputeId)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', ...this.authHeaders() },
        body: JSON.stringify(this.toDoc(dispute)),
      });
    } catch (err) {
      this.logger.warn(`Elasticsearch index failed for ${dispute.disputeId}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  async search(query: string, limit = 200): Promise<string[]> {
    if (!this.enabled || !query?.trim()) return [];
    try {
      const res = await fetch(`${this.node}/${this.index}/_search`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...this.authHeaders() },
        body: JSON.stringify({
          size: limit,
          query: {
            multi_match: {
              query,
              fields: ['description^3', 'resolution^2', 'disputeId^4', 'initiatorEmail', 'initiatorName', 'jurisdiction'],
              fuzziness: 'AUTO',
            },
          },
        }),
      });
      if (!res.ok) return [];
      const body = (await res.json()) as any;
      return (body?.hits?.hits || []).map((h: any) => String(h?._id)).filter(Boolean);
    } catch (err) {
      this.logger.warn(`Elasticsearch search failed: ${err instanceof Error ? err.message : String(err)}`);
      return [];
    }
  }

  private toDoc(dispute: Dispute) {
    const initiator: any = (dispute as any).initiator;
    return {
      disputeId: dispute.disputeId,
      description: dispute.description,
      resolution: dispute.resolution,
      status: dispute.status,
      disputeType: dispute.disputeType,
      requestedAmount: dispute.requestedAmount,
      initiatedBy: dispute.initiatedBy,
      resolvedBy: dispute.resolvedBy,
      agreementId: (dispute as any).agreement?.id,
      jurisdiction: (dispute as any).metadata?.jurisdiction,
      initiatorEmail: initiator?.email,
      initiatorName: [initiator?.firstName, initiator?.lastName].filter(Boolean).join(' '),
      createdAt: dispute.createdAt,
      updatedAt: dispute.updatedAt,
    };
  }

  private authHeaders(): Record<string, string> {
    const user = this.config.get<string>('ELASTICSEARCH_USERNAME');
    const pass = this.config.get<string>('ELASTICSEARCH_PASSWORD');
    if (!user || !pass) return {};
    return { Authorization: `Basic ${Buffer.from(`${user}:${pass}`).toString('base64')}` };
  }
}
