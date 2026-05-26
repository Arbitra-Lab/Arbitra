import { HttpStatus } from '@nestjs/common';
import { BaseAppError } from '../errors/base.error';
import { ErrorCode } from '../errors/error-codes';

/**
 * Thrown when a bulkhead compartment has no free execution slot and its
 * waiting queue is full. Surfaced as HTTP 503 so callers/clients can back off.
 */
export class BulkheadCapacityExceededError extends BaseAppError {
  public readonly compartment: string;

  constructor(compartment: string, maxConcurrent: number, maxQueue: number) {
    super(
      ErrorCode.BULKHEAD_CAPACITY_EXCEEDED,
      HttpStatus.SERVICE_UNAVAILABLE,
      `Bulkhead "${compartment}" is at capacity (max ${maxConcurrent} concurrent, ${maxQueue} queued)`,
      true,
      { compartment, maxConcurrent, maxQueue },
    );
    this.compartment = compartment;
  }
}

/**
 * Thrown when a feature is requested while the system has shed it as part of
 * graceful degradation.
 */
export class FeatureDisabledError extends BaseAppError {
  public readonly feature: string;

  constructor(feature: string, level: string) {
    super(
      ErrorCode.FEATURE_DISABLED,
      HttpStatus.SERVICE_UNAVAILABLE,
      `Feature "${feature}" is disabled while the system is degraded (level: ${level})`,
      true,
      { feature, level },
    );
    this.feature = feature;
  }
}
