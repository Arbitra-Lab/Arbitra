import { Injectable, Logger, Inject } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import {
  GuestReview,
  ReviewModerationStatus,
} from './entities/guest-review.entity';
import {
  HostReview,
  ReviewModerationStatus as HostReviewModerationStatus,
} from './entities/host-review.entity';
import { scoreContent } from './review-moderation.util';
import { NotificationsService } from '../notifications/notifications.service';

const AUTORELEASE_CONFIDENCE_THRESHOLD = 0.8;
const REVIEW_RATE_LIMIT_PER_HOUR = 10;

@Injectable()
export class ReviewModerationService {
  private readonly logger = new Logger(ReviewModerationService.name);

  constructor(
    @InjectRepository(GuestReview)
    private readonly guestReviewRepository: Repository<GuestReview>,
    @InjectRepository(HostReview)
    private readonly hostReviewRepository: Repository<HostReview>,
    private readonly notificationsService: NotificationsService,
  ) {}

  async checkReviewRateLimit(userId: string): Promise<boolean> {
    const count = await this.countReviewsInLastHour(userId);
    return count >= REVIEW_RATE_LIMIT_PER_HOUR;
  }

  private async countReviewsInLastHour(userId: string): Promise<number> {
    const oneHourAgo = new Date(Date.now() - 60 * 60 * 1000);

    const guestCount = await this.guestReviewRepository.count({
      where: {
        hostId: userId,
        createdAt: () => `"created_at" > '${oneHourAgo.toISOString()}'`,
      },
    });

    const hostCount = await this.hostReviewRepository.count({
      where: {
        guestId: userId,
        createdAt: () => `"created_at" > '${oneHourAgo.toISOString()}'`,
      },
    });

    return guestCount + hostCount;
  }

  async processModerationForGuestReview(
    review: GuestReview,
  ): Promise<GuestReview> {
    const result = scoreContent(review.comment || '');

    review.moderationConfidence = result.confidence;
    review.moderationReason = result.reason;

    if (result.confidence >= AUTORELEASE_CONFIDENCE_THRESHOLD) {
      review.moderationStatus = ReviewModerationStatus.APPROVED;
      this.logger.log(
        `Guest review ${review.id} auto-approved with confidence ${result.confidence}`,
      );
    } else if (result.isFlagged) {
      review.moderationStatus = ReviewModerationStatus.PENDING;
      this.logger.log(
        `Guest review ${review.id} flagged for manual review: ${result.reason}`,
      );
      await this.notifyModerationQueue(review.id, 'guest', result.reason);
    } else {
      review.moderationStatus = ReviewModerationStatus.APPROVED;
      this.logger.log(
        `Guest review ${review.id} auto-approved (clean content)`,
      );
    }

    return review;
  }

  async processModerationForHostReview(
    review: HostReview,
  ): Promise<HostReview> {
    const result = scoreContent(review.comment || '');

    review.moderationConfidence = result.confidence;
    review.moderationReason = result.reason;

    if (result.confidence >= AUTORELEASE_CONFIDENCE_THRESHOLD) {
      review.moderationStatus = HostReviewModerationStatus.APPROVED;
      this.logger.log(
        `Host review ${review.id} auto-approved with confidence ${result.confidence}`,
      );
    } else if (result.isFlagged) {
      review.moderationStatus = HostReviewModerationStatus.PENDING;
      this.logger.log(
        `Host review ${review.id} flagged for manual review: ${result.reason}`,
      );
      await this.notifyModerationQueue(review.id, 'host', result.reason);
    } else {
      review.moderationStatus = HostReviewModerationStatus.APPROVED;
      this.logger.log(`Host review ${review.id} auto-approved (clean content)`);
    }

    return review;
  }

  async getPendingModerationQueue(
    page = 1,
    limit = 20,
  ): Promise<{
    guestReviews: GuestReview[];
    hostReviews: HostReview[];
    total: number;
  }> {
    const [guestReviews, guestCount] = await this.guestReviewRepository.findAndCount({
      where: { moderationStatus: ReviewModerationStatus.PENDING },
      order: { createdAt: 'ASC' },
      skip: (page - 1) * limit,
      take: limit,
    });

    const [hostReviews, hostCount] = await this.hostReviewRepository.findAndCount({
      where: { moderationStatus: HostReviewModerationStatus.PENDING },
      order: { createdAt: 'ASC' },
      skip: (page - 1) * limit,
      take: limit,
    });

    return {
      guestReviews,
      hostReviews,
      total: guestCount + hostCount,
    };
  }

  async approveReview(reviewId: string, type: 'guest' | 'host'): Promise<void> {
    if (type === 'guest') {
      const review = await this.guestReviewRepository.findOne({
        where: { id: reviewId },
      });
      if (review) {
        review.moderationStatus = ReviewModerationStatus.APPROVED;
        await this.guestReviewRepository.save(review);
        await this.notifyReviewStatusChange(
          review.hostId,
          review.id,
          'approved',
        );
        this.logger.log(`Guest review ${reviewId} approved by moderator`);
      }
    } else {
      const review = await this.hostReviewRepository.findOne({
        where: { id: reviewId },
      });
      if (review) {
        review.moderationStatus = HostReviewModerationStatus.APPROVED;
        await this.hostReviewRepository.save(review);
        await this.notifyReviewStatusChange(
          review.guestId,
          review.id,
          'approved',
        );
        this.logger.log(`Host review ${reviewId} approved by moderator`);
      }
    }
  }

  async rejectReview(reviewId: string, type: 'guest' | 'host'): Promise<void> {
    if (type === 'guest') {
      const review = await this.guestReviewRepository.findOne({
        where: { id: reviewId },
      });
      if (review) {
        review.moderationStatus = ReviewModerationStatus.REJECTED;
        await this.guestReviewRepository.save(review);
        await this.notifyReviewStatusChange(
          review.hostId,
          review.id,
          'rejected',
        );
        this.logger.log(`Guest review ${reviewId} rejected by moderator`);
      }
    } else {
      const review = await this.hostReviewRepository.findOne({
        where: { id: reviewId },
      });
      if (review) {
        review.moderationStatus = HostReviewModerationStatus.REJECTED;
        await this.hostReviewRepository.save(review);
        await this.notifyReviewStatusChange(
          review.guestId,
          review.id,
          'rejected',
        );
        this.logger.log(`Host review ${reviewId} rejected by moderator`);
      }
    }
  }

  private async notifyModerationQueue(
    reviewId: string,
    type: string,
    reason: string,
  ): Promise<void> {
    try {
      this.logger.log(
        `Review ${reviewId} queued for moderation. Reason: ${reason}`,
      );
      // Moderators could be notified here via a webhook or separate notification
    } catch (error) {
      this.logger.error(
        `Failed to notify moderation queue for review ${reviewId}`,
        error,
      );
    }
  }

  private async notifyReviewStatusChange(
    userId: string,
    reviewId: string,
    status: string,
  ): Promise<void> {
    try {
      const title = `Your review has been ${status}`;
      const message =
        status === 'approved'
          ? 'Your review is now published and visible to others.'
          : 'Your review did not meet our community guidelines and has been rejected. Please review our policies.';

      await this.notificationsService.notify(
        userId,
        title,
        message,
        `review_${status}`,
      );
    } catch (error) {
      this.logger.error(
        `Failed to notify user ${userId} about review status`,
        error,
      );
    }
  }
}
