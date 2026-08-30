import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Review } from './review.entity';
import { ReviewsService } from './reviews.service';
import { ReviewsController } from './reviews.controller';
import { ReviewPromptService } from '../reviews/review-prompt.service';
import { ReviewModerationService } from './review-moderation.service';
import { GuestReview } from './entities/guest-review.entity';
import { HostReview } from './entities/host-review.entity';
import { RentAgreement } from '../rent/entities/rent-contract.entity';
import { NotificationsService } from '../notifications/notifications.service';
import { Notification } from '../notifications/entities/notification.entity';
import { UserNotificationPreference } from '../users/entities/user-notification-preference.entity';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Review,
      GuestReview,
      HostReview,
      RentAgreement,
      Notification,
      UserNotificationPreference,
    ]),
  ],
  providers: [
    ReviewsService,
    ReviewPromptService,
    ReviewModerationService,
    NotificationsService,
  ],
  controllers: [ReviewsController],
  exports: [ReviewsService, ReviewPromptService, ReviewModerationService],
})
export class ReviewsModule {}
