# API Integration Procedures

This document defines procedures for integrating third-party APIs and webhooks into the Houston Housing backend, covering integration patterns, testing, error handling, retry logic, and monitoring.

Use this together with:

- [API Standards](../api/API-STANDARDS.md)
- [Error Handling](../ERROR_HANDLING.md)
- [Webhook Management](../api/WEBHOOK-MANAGEMENT.md)

---

## 1. Overview

API integration procedures ensure:

- reliable communication with external services
- consistent error handling and retry logic
- secure credential management
- comprehensive testing and monitoring
- graceful degradation when services fail

This document is written for backend engineers integrating third-party services.

---

## 2. Third-Party API Integration

### 2.1 Integration Planning

Before integrating a third-party API:

- [ ] Review API documentation and rate limits
- [ ] Identify authentication method
- [ ] Determine data flow and dependencies
- [ ] Plan error handling strategy
- [ ] Design retry and timeout logic
- [ ] Identify monitoring requirements
- [ ] Plan for API versioning changes
- [ ] Review security and compliance requirements

### 2.2 API Client Architecture

Standard API client structure:

```typescript
// src/integrations/<service>/client.ts
import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios, { AxiosInstance, AxiosRequestConfig } from 'axios';
import { CircuitBreaker } from './circuit-breaker';
import { RetryPolicy } from './retry-policy';

@Injectable()
export class ThirdPartyApiClient {
  private readonly logger = new Logger(ThirdPartyApiClient.name);
  private readonly httpClient: AxiosInstance;
  private readonly circuitBreaker: CircuitBreaker;

  constructor(private readonly configService: ConfigService) {
    this.httpClient = axios.create({
      baseURL: this.configService.get('THIRD_PARTY_API_URL'),
      timeout: 30000,
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'Houston Housing/1.0',
      },
    });

    this.circuitBreaker = new CircuitBreaker({
      failureThreshold: 5,
      resetTimeout: 60000,
    });

    this.setupInterceptors();
  }

  private setupInterceptors(): void {
    // Request interceptor for authentication
    this.httpClient.interceptors.request.use(
      (config) => {
        const apiKey = this.configService.get('THIRD_PARTY_API_KEY');
        config.headers.Authorization = `Bearer ${apiKey}`;

        this.logger.debug(
          `Request: ${config.method?.toUpperCase()} ${config.url}`,
        );
        return config;
      },
      (error) => {
        this.logger.error('Request interceptor error', error);
        return Promise.reject(error);
      },
    );

    // Response interceptor for logging and error handling
    this.httpClient.interceptors.response.use(
      (response) => {
        this.logger.debug(
          `Response: ${response.status} ${response.config.url}`,
        );
        return response;
      },
      (error) => {
        this.logger.error('Response error', {
          url: error.config?.url,
          status: error.response?.status,
          message: error.message,
        });
        return Promise.reject(error);
      },
    );
  }
}
```

### 2.3 Authentication Patterns

#### API Key Authentication

```typescript
private authenticate(config: AxiosRequestConfig): AxiosRequestConfig {
  const apiKey = this.configService.get('API_KEY');
  config.headers['X-API-Key'] = apiKey;
  return config;
}
```

#### OAuth 2.0 Authentication

```typescript
private async getAccessToken(): Promise<string> {
  const cached = await this.cacheService.get('oauth_token');
  if (cached) return cached;

  const response = await axios.post(this.tokenUrl, {
    grant_type: 'client_credentials',
    client_id: this.clientId,
    client_secret: this.clientSecret,
  });

  await this.cacheService.set(
    'oauth_token',
    response.data.access_token,
    response.data.expires_in - 60,
  );

  return response.data.access_token;
}
```

#### JWT Authentication

```typescript
private generateJWT(): string {
  return jwt.sign(
    { iss: this.clientId, aud: this.apiUrl },
    this.privateKey,
    { algorithm: 'RS256', expiresIn: '1h' },
  );
}
```

### 2.4 Request/Response Handling

```typescript
async makeRequest<T>(
  method: string,
  endpoint: string,
  data?: any,
): Promise<T> {
  try {
    const response = await this.circuitBreaker.execute(async () => {
      return await this.httpClient.request<T>({
        method,
        url: endpoint,
        data,
      });
    });

    return response.data;
  } catch (error) {
    throw this.handleError(error);
  }
}
```

### 2.5 Rate Limiting

```typescript
import { RateLimiterMemory } from 'rate-limiter-flexible';

export class RateLimitedClient {
  private rateLimiter: RateLimiterMemory;

  constructor() {
    this.rateLimiter = new RateLimiterMemory({
      points: 100, // requests
      duration: 60, // per 60 seconds
    });
  }

  async executeWithRateLimit<T>(fn: () => Promise<T>): Promise<T> {
    await this.rateLimiter.consume('api_key', 1);
    return await fn();
  }
}
```

### 2.6 Timeout Configuration

```typescript
const timeoutConfig = {
  connect: 5000, // connection timeout
  request: 30000, // request timeout
  response: 30000, // response timeout
};

this.httpClient = axios.create({
  timeout: timeoutConfig.request,
  signal: AbortSignal.timeout(timeoutConfig.response),
});
```

---

## 3. Error Handling

### 3.1 Error Classification

```typescript
export enum ApiErrorType {
  NETWORK_ERROR = 'NETWORK_ERROR',
  TIMEOUT_ERROR = 'TIMEOUT_ERROR',
  AUTH_ERROR = 'AUTH_ERROR',
  RATE_LIMIT_ERROR = 'RATE_LIMIT_ERROR',
  CLIENT_ERROR = 'CLIENT_ERROR',
  SERVER_ERROR = 'SERVER_ERROR',
  VALIDATION_ERROR = 'VALIDATION_ERROR',
}

export class ApiIntegrationError extends Error {
  constructor(
    public readonly type: ApiErrorType,
    public readonly statusCode: number,
    public readonly originalError: any,
    message: string,
  ) {
    super(message);
    this.name = 'ApiIntegrationError';
  }
}
```

### 3.2 Error Handler Implementation

```typescript
private handleError(error: any): ApiIntegrationError {
  if (axios.isAxiosError(error)) {
    if (!error.response) {
      return new ApiIntegrationError(
        ApiErrorType.NETWORK_ERROR,
        0,
        error,
        'Network error or service unavailable',
      );
    }

    const status = error.response.status;

    if (status === 401 || status === 403) {
      return new ApiIntegrationError(
        ApiErrorType.AUTH_ERROR,
        status,
        error,
        'Authentication failed',
      );
    }

    if (status === 429) {
      return new ApiIntegrationError(
        ApiErrorType.RATE_LIMIT_ERROR,
        status,
        error,
        'Rate limit exceeded',
      );
    }

    if (status >= 400 && status < 500) {
      return new ApiIntegrationError(
        ApiErrorType.CLIENT_ERROR,
        status,
        error,
        error.response.data?.message || 'Client error',
      );
    }

    if (status >= 500) {
      return new ApiIntegrationError(
        ApiErrorType.SERVER_ERROR,
        status,
        error,
        'Server error',
      );
    }
  }

  if (error.code === 'ECONNABORTED') {
    return new ApiIntegrationError(
      ApiErrorType.TIMEOUT_ERROR,
      0,
      error,
      'Request timeout',
    );
  }

  return new ApiIntegrationError(
    ApiErrorType.NETWORK_ERROR,
    0,
    error,
    error.message || 'Unknown error',
  );
}
```

### 3.3 Graceful Degradation

```typescript
async fetchDataWithFallback<T>(
  primaryFn: () => Promise<T>,
  fallbackFn: () => Promise<T>,
): Promise<T> {
  try {
    return await primaryFn();
  } catch (error) {
    this.logger.warn('Primary API failed, using fallback', error);
    return await fallbackFn();
  }
}

async fetchDataWithCache<T>(
  key: string,
  apiFn: () => Promise<T>,
  ttl: number = 3600,
): Promise<T> {
  try {
    const data = await apiFn();
    await this.cacheService.set(key, data, ttl);
    return data;
  } catch (error) {
    const cached = await this.cacheService.get<T>(key);
    if (cached) {
      this.logger.warn('API failed, returning stale cache', error);
      return cached;
    }
    throw error;
  }
}
```

---

## 4. Retry Logic

### 4.1 Retry Strategy

```typescript
export interface RetryConfig {
  maxRetries: number;
  initialDelay: number;
  maxDelay: number;
  backoffMultiplier: number;
  retryableErrors: ApiErrorType[];
}

export class RetryPolicy {
  private readonly config: RetryConfig = {
    maxRetries: 3,
    initialDelay: 1000,
    maxDelay: 30000,
    backoffMultiplier: 2,
    retryableErrors: [
      ApiErrorType.NETWORK_ERROR,
      ApiErrorType.TIMEOUT_ERROR,
      ApiErrorType.SERVER_ERROR,
      ApiErrorType.RATE_LIMIT_ERROR,
    ],
  };

  async executeWithRetry<T>(fn: () => Promise<T>): Promise<T> {
    let lastError: Error;

    for (let attempt = 0; attempt <= this.config.maxRetries; attempt++) {
      try {
        return await fn();
      } catch (error) {
        lastError = error;

        if (!this.shouldRetry(error, attempt)) {
          throw error;
        }

        const delay = this.calculateDelay(attempt, error);
        this.logger.warn(
          `Retry attempt ${attempt + 1}/${this.config.maxRetries} after ${delay}ms`,
        );
        await this.sleep(delay);
      }
    }

    throw lastError;
  }
}
```

### 4.2 Exponential Backoff

```typescript
private calculateDelay(attempt: number, error: any): number {
  let delay = this.config.initialDelay * Math.pow(this.config.backoffMultiplier, attempt);
  delay = Math.min(delay, this.config.maxDelay);

  // Add jitter to prevent thundering herd
  const jitter = Math.random() * 0.3 * delay;
  delay = delay + jitter;

  // Respect Retry-After header for rate limits
  if (error instanceof ApiIntegrationError && error.type === ApiErrorType.RATE_LIMIT_ERROR) {
    const retryAfter = error.originalError?.response?.headers['retry-after'];
    if (retryAfter) {
      delay = parseInt(retryAfter) * 1000;
    }
  }

  return Math.floor(delay);
}

private shouldRetry(error: any, attempt: number): boolean {
  if (attempt >= this.config.maxRetries) {
    return false;
  }

  if (error instanceof ApiIntegrationError) {
    return this.config.retryableErrors.includes(error.type);
  }

  return false;
}

private sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
```

### 4.3 Circuit Breaker Pattern

```typescript
export class CircuitBreaker {
  private state: 'CLOSED' | 'OPEN' | 'HALF_OPEN' = 'CLOSED';
  private failureCount = 0;
  private lastFailureTime: number = 0;

  constructor(
    private readonly failureThreshold: number = 5,
    private readonly resetTimeout: number = 60000,
  ) {}

  async execute<T>(fn: () => Promise<T>): Promise<T> {
    if (this.state === 'OPEN') {
      if (Date.now() - this.lastFailureTime >= this.resetTimeout) {
        this.state = 'HALF_OPEN';
      } else {
        throw new Error('Circuit breaker is OPEN');
      }
    }

    try {
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }

  private onSuccess(): void {
    this.failureCount = 0;
    this.state = 'CLOSED';
  }

  private onFailure(): void {
    this.failureCount++;
    this.lastFailureTime = Date.now();

    if (this.failureCount >= this.failureThreshold) {
      this.state = 'OPEN';
    }
  }
}
```

---

## 5. Webhook Integration

### 5.1 Webhook Receiver

```typescript
@Controller('webhooks')
export class WebhookController {
  constructor(
    private readonly webhookService: WebhookService,
    private readonly logger: Logger,
  ) {}

  @Post(':provider')
  async handleWebhook(
    @Param('provider') provider: string,
    @Headers() headers: Record<string, string>,
    @Body() payload: any,
  ): Promise<{ received: boolean }> {
    const webhookId = uuidv4();

    this.logger.log(`Webhook received: ${provider}`, { webhookId });

    // Verify signature
    const isValid = await this.webhookService.verifySignature(
      provider,
      headers,
      payload,
    );

    if (!isValid) {
      this.logger.error('Invalid webhook signature', { webhookId, provider });
      throw new UnauthorizedException('Invalid signature');
    }

    // Queue for async processing
    await this.webhookService.queueWebhook({
      id: webhookId,
      provider,
      payload,
      receivedAt: new Date(),
    });

    return { received: true };
  }
}
```

### 5.2 Signature Verification

```typescript
async verifySignature(
  provider: string,
  headers: Record<string, string>,
  payload: any,
): Promise<boolean> {
  switch (provider) {
    case 'stripe':
      return this.verifyStripeSignature(headers, payload);
    case 'github':
      return this.verifyGithubSignature(headers, payload);
    default:
      return this.verifyHmacSignature(headers, payload);
  }
}

private verifyHmacSignature(
  headers: Record<string, string>,
  payload: any,
): boolean {
  const signature = headers['x-webhook-signature'];
  const timestamp = headers['x-webhook-timestamp'];

  // Prevent replay attacks
  const age = Date.now() - parseInt(timestamp);
  if (age > 300000) { // 5 minutes
    return false;
  }

  const secret = this.configService.get('WEBHOOK_SECRET');
  const expectedSignature = crypto
    .createHmac('sha256', secret)
    .update(`${timestamp}.${JSON.stringify(payload)}`)
    .digest('hex');

  return crypto.timingSafeEqual(
    Buffer.from(signature),
    Buffer.from(expectedSignature),
  );
}
```

### 5.3 Webhook Processing

```typescript
@Processor('webhooks')
export class WebhookProcessor {
  @Process('process-webhook')
  async processWebhook(job: Job<WebhookPayload>): Promise<void> {
    const { id, provider, payload } = job.data;

    try {
      await this.webhookService.process(provider, payload);

      await this.webhookLogRepository.save({
        id,
        provider,
        status: 'processed',
        processedAt: new Date(),
      });
    } catch (error) {
      this.logger.error('Webhook processing failed', { id, error });

      await this.webhookLogRepository.save({
        id,
        provider,
        status: 'failed',
        error: error.message,
        processedAt: new Date(),
      });

      throw error; // Trigger retry
    }
  }
}
```

### 5.4 Webhook Retry Logic

```typescript
const webhookQueue = new Queue('webhooks', {
  defaultJobOptions: {
    attempts: 5,
    backoff: {
      type: 'exponential',
      delay: 2000,
    },
    removeOnComplete: 100,
    removeOnFail: 1000,
  },
});
```

---

## 6. Integration Testing

### 6.1 Unit Tests

```typescript
describe('ThirdPartyApiClient', () => {
  let client: ThirdPartyApiClient;
  let mockAxios: MockAdapter;

  beforeEach(() => {
    mockAxios = new MockAdapter(axios);
    client = new ThirdPartyApiClient(configService);
  });

  it('should successfully make API request', async () => {
    mockAxios.onGet('/users/123').reply(200, { id: 123, name: 'Test' });

    const result = await client.getUser('123');

    expect(result).toEqual({ id: 123, name: 'Test' });
  });

  it('should retry on network error', async () => {
    mockAxios
      .onGet('/users/123')
      .replyOnce(500)
      .onGet('/users/123')
      .reply(200, { id: 123 });

    const result = await client.getUser('123');

    expect(result.id).toBe(123);
  });

  it('should throw on auth error without retry', async () => {
    mockAxios.onGet('/users/123').reply(401);

    await expect(client.getUser('123')).rejects.toThrow(ApiIntegrationError);
  });
});
```

### 6.2 Integration Tests

```typescript
describe('ThirdPartyApiClient Integration', () => {
  let app: INestApplication;
  let client: ThirdPartyApiClient;

  beforeAll(async () => {
    const module = await Test.createTestingModule({
      imports: [IntegrationModule],
    }).compile();

    app = module.createNestApplication();
    await app.init();

    client = app.get(ThirdPartyApiClient);
  });

  it('should integrate with real API in test environment', async () => {
    const result = await client.getUser('test-user-id');

    expect(result).toHaveProperty('id');
    expect(result).toHaveProperty('name');
  });

  afterAll(async () => {
    await app.close();
  });
});
```

### 6.3 Contract Testing

```typescript
import { Pact } from '@pact-foundation/pact';

describe('ThirdParty API Contract', () => {
  const provider = new Pact({
    consumer: 'Houston Housing',
    provider: 'ThirdPartyAPI',
  });

  beforeAll(() => provider.setup());
  afterAll(() => provider.finalize());

  it('should get user by ID', async () => {
    await provider.addInteraction({
      state: 'user exists',
      uponReceiving: 'a request for user',
      withRequest: {
        method: 'GET',
        path: '/users/123',
        headers: { Accept: 'application/json' },
      },
      willRespondWith: {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
        body: { id: 123, name: 'Test User' },
      },
    });

    const result = await client.getUser('123');
    expect(result.name).toBe('Test User');
  });
});
```

### 6.4 Mock Server Testing

```typescript
import nock from 'nock';

describe('API Client with Nock', () => {
  beforeEach(() => {
    nock('https://api.thirdparty.com')
      .get('/users/123')
      .reply(200, { id: 123, name: 'Test' });
  });

  afterEach(() => {
    nock.cleanAll();
  });

  it('should call mocked endpoint', async () => {
    const result = await client.getUser('123');
    expect(result.id).toBe(123);
  });
});
```

---

## 7. Integration Monitoring

### 7.1 Metrics Collection

```typescript
@Injectable()
export class MetricsService {
  private readonly requestCounter = new Counter({
    name: 'api_integration_requests_total',
    help: 'Total API integration requests',
    labelNames: ['provider', 'endpoint', 'status'],
  });

  private readonly requestDuration = new Histogram({
    name: 'api_integration_request_duration_seconds',
    help: 'API integration request duration',
    labelNames: ['provider', 'endpoint'],
    buckets: [0.1, 0.5, 1, 2, 5, 10],
  });

  private readonly errorCounter = new Counter({
    name: 'api_integration_errors_total',
    help: 'Total API integration errors',
    labelNames: ['provider', 'error_type'],
  });

  recordRequest(
    provider: string,
    endpoint: string,
    status: number,
    duration: number,
  ): void {
    this.requestCounter.inc({ provider, endpoint, status });
    this.requestDuration.observe({ provider, endpoint }, duration);
  }

  recordError(provider: string, errorType: string): void {
    this.errorCounter.inc({ provider, error_type: errorType });
  }
}
```

### 7.2 Health Checks

```typescript
@Injectable()
export class IntegrationHealthIndicator extends HealthIndicator {
  constructor(private readonly apiClient: ThirdPartyApiClient) {
    super();
  }

  async isHealthy(key: string): Promise<HealthIndicatorResult> {
    try {
      await this.apiClient.healthCheck();
      return this.getStatus(key, true);
    } catch (error) {
      return this.getStatus(key, false, { message: error.message });
    }
  }
}

@Controller('health')
export class HealthController {
  constructor(
    private health: HealthCheckService,
    private integrationHealth: IntegrationHealthIndicator,
  ) {}

  @Get()
  @HealthCheck()
  check() {
    return this.health.check([
      () => this.integrationHealth.isHealthy('third_party_api'),
    ]);
  }
}
```

### 7.3 Logging

```typescript
async makeRequest<T>(endpoint: string): Promise<T> {
  const startTime = Date.now();
  const requestId = uuidv4();

  this.logger.log('API request started', {
    requestId,
    provider: this.providerName,
    endpoint,
  });

  try {
    const result = await this.httpClient.get<T>(endpoint);
    const duration = Date.now() - startTime;

    this.logger.log('API request succeeded', {
      requestId,
      provider: this.providerName,
      endpoint,
      duration,
      status: result.status,
    });

    this.metricsService.recordRequest(
      this.providerName,
      endpoint,
      result.status,
      duration / 1000,
    );

    return result.data;
  } catch (error) {
    const duration = Date.now() - startTime;

    this.logger.error('API request failed', {
      requestId,
      provider: this.providerName,
      endpoint,
      duration,
      error: error.message,
      stack: error.stack,
    });

    this.metricsService.recordError(this.providerName, error.type);

    throw error;
  }
}
```

### 7.4 Alerting

```yaml
# Prometheus alert rules
- alert: IntegrationHighErrorRate
  expr: |
    sum(rate(api_integration_errors_total[5m])) by (provider)
    / 
    sum(rate(api_integration_requests_total[5m])) by (provider) > 0.1
  for: 5m
  labels:
    severity: high
  annotations:
    summary: 'High error rate for {{ $labels.provider }}'
    description: 'Error rate is {{ $value | humanizePercentage }}'

- alert: IntegrationHighLatency
  expr: |
    histogram_quantile(0.95,
      rate(api_integration_request_duration_seconds_bucket[5m])
    ) > 5
  for: 10m
  labels:
    severity: medium
  annotations:
    summary: 'High latency for {{ $labels.provider }}'
    description: 'P95 latency is {{ $value }}s'

- alert: IntegrationDown
  expr: up{job="integration_health"} == 0
  for: 2m
  labels:
    severity: critical
  annotations:
    summary: 'Integration {{ $labels.provider }} is down'
```

---

## 8. Best Practices

### 8.1 Security

- Store API credentials in secure secret management system
- Rotate credentials regularly
- Use environment-specific credentials
- Never log sensitive data (API keys, tokens, PII)
- Validate and sanitize all webhook payloads
- Implement signature verification for webhooks
- Use TLS 1.2+ for all API communications
- Implement IP whitelisting where supported

### 8.2 Reliability

- Implement circuit breakers for failing services
- Use exponential backoff with jitter for retries
- Set appropriate timeouts for all requests
- Cache responses when appropriate
- Implement graceful degradation
- Queue webhook processing asynchronously
- Monitor integration health continuously
- Have fallback strategies for critical integrations

### 8.3 Performance

- Use connection pooling
- Implement request batching where supported
- Cache authentication tokens
- Use compression for large payloads
- Implement pagination for large result sets
- Monitor and optimize slow requests
- Use async processing for non-critical operations

### 8.4 Maintainability

- Document all integration points
- Version API clients
- Use TypeScript for type safety
- Write comprehensive tests
- Keep integration code isolated in modules
- Use dependency injection
- Follow consistent error handling patterns
- Maintain integration runbooks

---

## 9. Integration Checklist

Pre-integration:

- [ ] API documentation reviewed
- [ ] Authentication method identified
- [ ] Rate limits documented
- [ ] Error handling strategy defined
- [ ] Retry logic designed
- [ ] Timeout values determined
- [ ] Security requirements reviewed
- [ ] Monitoring plan created

Implementation:

- [ ] API client created with proper structure
- [ ] Authentication implemented
- [ ] Request/response handling implemented
- [ ] Error handling implemented
- [ ] Retry logic implemented
- [ ] Circuit breaker implemented
- [ ] Rate limiting implemented
- [ ] Logging added
- [ ] Metrics collection added

Testing:

- [ ] Unit tests written
- [ ] Integration tests written
- [ ] Error scenarios tested
- [ ] Retry logic tested
- [ ] Timeout handling tested
- [ ] Rate limit handling tested
- [ ] Webhook signature verification tested
- [ ] Load testing performed

Deployment:

- [ ] Configuration documented
- [ ] Secrets configured in all environments
- [ ] Health checks implemented
- [ ] Monitoring dashboards created
- [ ] Alerts configured
- [ ] Runbook created
- [ ] Team trained on integration
- [ ] Rollback plan documented

---

## 10. Integration Troubleshooting

### 10.1 Authentication Failures

Symptoms:

- 401 Unauthorized responses
- 403 Forbidden responses
- Token expired errors

Diagnostics:

```bash
# Check API credentials
echo $THIRD_PARTY_API_KEY

# Test authentication manually
curl -H "Authorization: Bearer $TOKEN" https://api.example.com/test

# Check token expiration
jwt decode $TOKEN
```

Solutions:

- Verify credentials are correct
- Rotate expired credentials
- Check token refresh logic
- Verify OAuth flow

### 10.2 Rate Limiting

Symptoms:

- 429 Too Many Requests responses
- Requests being throttled
- Slow response times

Diagnostics:

```bash
# Check rate limit metrics
curl http://localhost:9090/api/v1/query?query='rate(api_integration_requests_total[1m])'

# Check Retry-After headers in logs
grep "Retry-After" /var/log/huston-housing/integration.log
```

Solutions:

- Implement request queuing
- Reduce request frequency
- Implement caching
- Request rate limit increase from provider

### 10.3 Timeout Errors

Symptoms:

- ECONNABORTED errors
- Request timeout errors
- Slow API responses

Diagnostics:

```bash
# Check request duration metrics
curl http://localhost:9090/api/v1/query?query='histogram_quantile(0.95, rate(api_integration_request_duration_seconds_bucket[5m]))'

# Test API latency
time curl https://api.example.com/test
```

Solutions:

- Increase timeout values
- Optimize API requests
- Implement async processing
- Contact provider about performance

### 10.4 Webhook Processing Failures

Symptoms:

- Webhooks not being processed
- Queue backlog growing
- Duplicate webhook processing

Diagnostics:

```bash
# Check webhook queue
curl http://localhost:5000/admin/queues

# Check webhook logs
docker logs huston-housing-backend | grep "webhook"

# Check failed jobs
# Visit Bull Board UI
```

Solutions:

- Restart webhook workers
- Fix processing logic errors
- Implement idempotency
- Clear stuck jobs

---

## 11. References

- [API Standards](../api/API-STANDARDS.md)
- [Error Handling](../ERROR_HANDLING.md)
- [Webhook Management](../api/WEBHOOK-MANAGEMENT.md)
- [Webhook Signature Verification](../api/WEBHOOK_SIGNATURE_VERIFICATION.md)
- [Monitoring and Alerting](../deployment/MONITORING_AND_ALERTING.md)
