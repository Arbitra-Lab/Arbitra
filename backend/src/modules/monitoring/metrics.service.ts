import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import {
  Registry,
  Histogram,
  Counter,
  collectDefaultMetrics,
} from 'prom-client';

/** Coerce an HTTP status code into a class label: 2xx, 3xx, 4xx, 5xx, or unknown. */
function statusClass(status: number): string {
  if (status >= 200 && status < 300) return '2xx';
  if (status >= 300 && status < 400) return '3xx';
  if (status >= 400 && status < 500) return '4xx';
  if (status >= 500) return '5xx';
  return 'unknown';
}

@Injectable()
export class MetricsService implements OnModuleInit {
  private readonly logger = new Logger(MetricsService.name);
  readonly registry = new Registry();

  // ── HTTP instrumentation ────────────────────────────────────────────────

  /**
   * Histogram for request latency.
   * Buckets cover the full range from fast (5 ms) to very slow (5 s).
   * Uses a Histogram, NOT a Summary, so quantiles are aggregatable across
   * multiple instances via recording rules in Prometheus/Thanos.
   */
  private readonly httpDuration = new Histogram({
    name: 'http_request_duration_ms',
    help: 'HTTP request latency in milliseconds',
    labelNames: ['route', 'method', 'status_class'] as const,
    buckets: [5, 10, 25, 50, 100, 250, 500, 1000, 2500, 5000],
    registers: [this.registry],
  });

  /** Counter for total HTTP requests, grouped by route + method + status_class. */
  private readonly httpRequests = new Counter({
    name: 'http_requests_total',
    help: 'Total number of HTTP requests',
    labelNames: ['route', 'method', 'status_class'] as const,
    registers: [this.registry],
  });

  // ── Other existing metrics (blockchain, db, business) ──────────────────

  private readonly blockchainTx = new Counter({
    name: 'blockchain_transactions_total',
    help: 'Total blockchain transactions',
    labelNames: ['type', 'status'] as const,
    registers: [this.registry],
  });

  private readonly blockchainFailures = new Counter({
    name: 'blockchain_failures_total',
    help: 'Total blockchain failures',
    labelNames: ['type'] as const,
    registers: [this.registry],
  });

  private readonly blockchainDuration = new Histogram({
    name: 'blockchain_operation_duration_ms',
    help: 'Blockchain operation latency in milliseconds',
    labelNames: ['type'] as const,
    buckets: [50, 100, 250, 500, 1000, 2500, 5000, 10000],
    registers: [this.registry],
  });

  private readonly dbQueryDuration = new Histogram({
    name: 'db_query_duration_ms',
    help: 'Database query latency in milliseconds',
    labelNames: ['query_type'] as const,
    buckets: [1, 5, 10, 25, 50, 100, 250, 500],
    registers: [this.registry],
  });

  private readonly rentPayments = new Counter({
    name: 'rent_payments_total',
    help: 'Total rent payment attempts',
    labelNames: ['status'] as const,
    registers: [this.registry],
  });

  private readonly nftMints = new Counter({
    name: 'nft_mints_total',
    help: 'Total NFT mints',
    labelNames: ['type'] as const,
    registers: [this.registry],
  });

  private readonly disputes = new Counter({
    name: 'disputes_total',
    help: 'Total disputes',
    labelNames: ['type', 'status'] as const,
    registers: [this.registry],
  });

  onModuleInit(): void {
    collectDefaultMetrics({ register: this.registry });
    this.logger.log('MetricsService initialised with prom-client');
  }

  // ── Public API (call sites unchanged) ──────────────────────────────────

  recordHttpRequest(method: string, route: string, status: number): void {
    this.httpRequests.inc({ route, method, status_class: statusClass(status) });
  }

  recordHttpDuration(
    method: string,
    route: string,
    status: number,
    durationMs: number,
  ): void {
    this.httpDuration.observe(
      { route, method, status_class: statusClass(status) },
      durationMs,
    );
  }

  recordBlockchainTransaction(
    type: string,
    status: 'success' | 'failure',
  ): void {
    this.blockchainTx.inc({ type, status });
  }

  recordBlockchainFailure(type: string, error: string): void {
    this.blockchainFailures.inc({ type });
    this.logger.warn(`Blockchain failure: ${type} - ${error}`);
  }

  recordBlockchainDuration(type: string, durationMs: number): void {
    this.blockchainDuration.observe({ type }, durationMs);
  }

  setDatabaseConnections(_count: number): void {
    // Gauge omitted — add a prom-client Gauge here if needed.
  }

  recordDatabaseQuery(queryType: string, durationMs: number): void {
    this.dbQueryDuration.observe({ query_type: queryType }, durationMs);
  }

  recordRentPayment(status: 'success' | 'failed'): void {
    this.rentPayments.inc({ status });
  }

  recordNftMint(type: string): void {
    this.nftMints.inc({ type });
  }

  recordDispute(type: string, status: string): void {
    this.disputes.inc({ type, status });
  }

  async getMetrics(): Promise<string> {
    return this.registry.metrics();
  }

  getRegistry(): Registry {
    return this.registry;
  }
}
