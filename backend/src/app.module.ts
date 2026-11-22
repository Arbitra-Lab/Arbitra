import {
  Module,
  ValidationPipe,
  MiddlewareConsumer,
  NestModule,
} from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { validateEnvironment } from './config/env.validation';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ThrottlerModule, ThrottlerGuard } from '@nestjs/throttler';
import { APP_GUARD, APP_FILTER, APP_INTERCEPTOR } from '@nestjs/core';
import { AppController } from './app.controller';
import { AppService } from './app.service';
import { AgreementsModule } from './modules/agreements/agreements.module';
import { AuditModule } from './modules/audit/audit.module';
import { AuthModule } from './modules/auth/auth.module';
import { UsersModule } from './modules/users/users.module';
import { PropertiesModule } from './modules/properties/properties.module';
import { StellarModule } from './modules/stellar/stellar.module';
import { DisputesModule } from './modules/disputes/disputes.module';
import { MonitoringModule } from './modules/monitoring/monitoring.module';
import { StatusModule } from './modules/status/status.module';
import { AllExceptionsFilter } from './common/filters/all-exceptions.filter';
import { SnakeNamingStrategy } from 'typeorm-naming-strategies';
import { PaymentModule } from './modules/payments/payment.module';
import { InsuranceModule } from './modules/insurance/insurance.module';
import { ProfileModule } from './modules/profile/profile.module';
import { SecurityModule } from './modules/security/security.module';
import { AuthRateLimitMiddleware } from './modules/auth/middleware/rate-limit.middleware';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { SecurityHeadersMiddleware } from './common/middleware/security-headers.middleware';
import { RequestSizeLimitMiddleware } from './common/middleware/request-size-limit.middleware';
import { CsrfMiddleware } from './common/middleware/csrf.middleware';
import { ThreatDetectionMiddleware } from './common/middleware/threat-detection.middleware';
import { CacheModule } from '@nestjs/cache-manager';
import { SentryModule } from '@sentry/nestjs/setup';
import { StorageModule } from './modules/storage/storage.module';
import { ReviewsModule } from './modules/reviews/reviews.module';
import { FeedbackModule } from './modules/feedback/feedback.module';
import { DeveloperModule } from './modules/developer/developer.module';
import { SearchModule } from './modules/search/search.module';
import { JobQueueService } from './common/services/job-queue.service';
import { RateLimitingModule } from './modules/rate-limiting/rate-limiting.module';
import { RateLimitHeadersMiddleware } from './modules/rate-limiting/middleware/rate-limit-headers.middleware';
import { AppCacheModule } from './common/cache/cache.module';
import { RedisModule } from './common/redis/redis.module';
import { RedisConnectionFactory } from './common/redis/redis-connection.factory';
import { ShutdownModule } from './config/shutdown.module';
import { I18nModule } from './modules/i18n/i18n.module';
import { LocalizationMiddleware } from './modules/i18n/middleware/localization.middleware';
import { CleanupModule } from './modules/cleanup/cleanup.module';
import { AiModule } from './modules/ai/ai.module';
import { LoggerModule } from './common/services/logger.module';
import { QueuesModule } from './modules/queues/queues.module';
import { WebhooksModule } from './modules/webhooks/webhooks.module';
import { ScreeningModule } from './modules/screening/screening.module';
import { ReferralModule } from './modules/referral/referral.module';
import { InquiriesModule } from './modules/inquiries/inquiries.module';
import { AnalyticsModule } from './modules/analytics/analytics.module';
import { LockModule } from './common/lock';
import { IdempotencyModule } from './common/idempotency';
import { ResilienceModule } from './common/resilience';
import { FraudModule } from './modules/fraud/fraud.module';
import { TransactionModule } from './modules/transactions/transaction.module';
import { ApiVersionModule } from './common/api-versioning/api-version.module';
import { ResponseTimeInterceptor } from './common/interceptors/response-time.interceptor';
import { TimeoutInterceptor } from './common/interceptors/timeout.interceptor';

@Module({
  imports: [
    ...(process.env.NODE_ENV === 'test' ? [] : [SentryModule.forRoot()]),
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: [`.env.${process.env.NODE_ENV || 'development'}`, '.env'],
      validate: validateEnvironment,
    }),
    LoggerModule,
    RedisModule,
    ShutdownModule,
    LockModule,
    IdempotencyModule,
    ResilienceModule,
    require('./common/services/encryption.module').EncryptionModule,
    process.env.NODE_ENV === 'test'
      ? CacheModule.register({
          isGlobal: true,
          ttl: 600,
          max: 100,
        })
      : CacheModule.registerAsync({
          isGlobal: true,
          inject: [RedisConnectionFactory],
          useFactory: async (
            redisFactory: RedisConnectionFactory,
          ): Promise<{ store: unknown; ttl: number }> =>
            redisFactory.createCacheStore(),
        }),
    AppCacheModule,
    ThrottlerModule.forRoot([
      {
        name: 'default',
        ttl: parseInt(process.env.RATE_LIMIT_TTL!),
        limit: parseInt(process.env.RATE_LIMIT_MAX!),
      },
      {
        name: 'auth',
        ttl: parseInt(process.env.RATE_LIMIT_AUTH_TTL!),
        limit: parseInt(process.env.RATE_LIMIT_AUTH_MAX!),
      },
      {
        name: 'strict',
        ttl: parseInt(process.env.RATE_LIMIT_STRICT_TTL!),
        limit: parseInt(process.env.RATE_LIMIT_STRICT_MAX!),
      },
    ]),
    TypeOrmModule.forRootAsync({
      inject: [],
      useFactory: () => {
        const isTest = process.env.NODE_ENV === 'test';
        const openapiGenerate = process.env.OPENAPI_GENERATE === 'true';

        // For OpenAPI generation, return a minimal config that doesn't connect to DB
        if (openapiGenerate) {
          return {
            type: 'sqlite',
            database: ':memory:',
            namingStrategy: new SnakeNamingStrategy(),
            entities: [], // Don't load entities for OpenAPI generation
            synchronize: false,
            logging: false,
          };
        }

        if (isTest && process.env.DB_TYPE === 'sqlite') {
          return {
            type: 'sqlite',
            database: ':memory:',
            namingStrategy: new SnakeNamingStrategy(),
            entities: [__dirname + '/modules/**/*.entity{.ts,.js}'],
            synchronize: true,
            logging: false,
          };
        }
        const config = {
          type: 'postgres' as const,
          host: process.env.DB_HOST,
          port: parseInt(process.env.DB_PORT || '5432'),
          username: process.env.DB_USERNAME,
          password: process.env.DB_PASSWORD,
          database: process.env.DB_NAME,
          namingStrategy: new SnakeNamingStrategy(),
          entities: [__dirname + '/modules/**/*.entity{.ts,.js}'],
          migrations: isTest ? [] : [__dirname + '/migrations/*{.ts,.js}'],
          synchronize: false,
          logging: process.env.TYPEORM_LOGGING === 'true',
          logger: 'advanced-console' as const,
          // Connection pooling configuration
          extra: {
            max: parseInt(process.env.DB_POOL_MAX || '20'),
            min: parseInt(process.env.DB_POOL_MIN || '5'),
            idleTimeoutMillis: parseInt(
              process.env.DB_POOL_IDLE_TIMEOUT || '30000',
            ),
            connectionTimeoutMillis: parseInt(
              process.env.DB_POOL_CONNECTION_TIMEOUT || '2000',
            ),
          },
        };
        console.log('[DEBUG] TypeORM Config:', {
          host: config.host,
          port: config.port,
          username: config.username,
          database: config.database,
          synchronize: config.synchronize,
          logging: config.logging,
          pool: config.extra,
        });
        return config;
      },
    }),
    AgreementsModule,
    AuditModule,
    AuthModule,
    UsersModule,
    PropertiesModule,
    StellarModule,
    DisputesModule,
    MonitoringModule,
    StatusModule,
    // Load HealthModule only when not generating OpenAPI (avoids loading broken @nestjs/terminus in script)
    ...(process.env.OPENAPI_GENERATE !== 'true'
      ? [require('./health/health.module').HealthModule]
      : []),
    PaymentModule,
    InsuranceModule,
    NotificationsModule,
    ProfileModule,
    SecurityModule,
    I18nModule,
    StorageModule,
    ReviewsModule,
    FeedbackModule,
    DeveloperModule,
    SearchModule,
    CleanupModule,
    AiModule,
    FraudModule,
    WebhooksModule,
    ScreeningModule,
    ReferralModule,
    InquiriesModule,
    AnalyticsModule,
    require('./modules/database-performance/database-performance.module')
      .DatabasePerformanceModule,
    TransactionModule,
    ...(process.env.OPENAPI_GENERATE !== 'true' ? [RateLimitingModule] : []),
    // Maintenance module
    require('./modules/maintenance/maintenance.module').MaintenanceModule,
    // KYC module
    require('./modules/kyc/kyc.module').KycModule,
    // Queue module
    ...(process.env.OPENAPI_GENERATE !== 'true' ? [QueuesModule] : []),
    // API versioning module
    ApiVersionModule,
  ],
  controllers: [AppController],
  providers: [
    AppService,
    JobQueueService,
    {
      provide: 'APP_PIPE',
      useClass: ValidationPipe,
    },
    {
      provide: APP_GUARD,
      useClass: ThrottlerGuard,
    },
    {
      provide: APP_FILTER,
      useClass: AllExceptionsFilter,
    },
    {
      provide: APP_INTERCEPTOR,
      useClass: ResponseTimeInterceptor,
    },
    {
      provide: APP_INTERCEPTOR,
      useClass: TimeoutInterceptor,
    },
  ],
})
export class AppModule implements NestModule {
  configure(consumer: MiddlewareConsumer) {
    consumer.apply(LocalizationMiddleware).forRoutes('*');

    // Security headers middleware (applied to all routes)
    consumer.apply(SecurityHeadersMiddleware).forRoutes('*');

    // Request size limiting (applied to all routes)
    consumer.apply(RequestSizeLimitMiddleware).forRoutes('*');

    // CSRF protection (applied to all routes except excluded ones)
    consumer.apply(CsrfMiddleware).forRoutes('*');

    // Rate limit headers middleware (applied to all routes)
    consumer.apply(RateLimitHeadersMiddleware).forRoutes('*');

    // Auth rate limiting (applied to specific auth routes)
    consumer
      .apply(AuthRateLimitMiddleware)
      .forRoutes(
        'auth/register',
        'auth/login',
        'auth/forgot-password',
        'auth/reset-password',
      );

    // Real-time threat detection (applied to all API routes)
    consumer.apply(ThreatDetectionMiddleware).forRoutes('api/*path');
  }
}
