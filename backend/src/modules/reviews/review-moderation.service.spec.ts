import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ReviewModerationService } from './review-moderation.service';
import { NotificationsService } from '../notifications/notifications.service';
import { GuestReview, ReviewModerationStatus } from './entities/guest-review.entity';
import { HostReview, ReviewModerationStatus as HostReviewModerationStatus } from './entities/host-review.entity';

describe('ReviewModerationService', () => {
  let service: ReviewModerationService;
  let guestReviewRepository: Repository<GuestReview>;
  let hostReviewRepository: Repository<HostReview>;
  let notificationsService: NotificationsService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ReviewModerationService,
        {
          provide: getRepositoryToken(GuestReview),
          useValue: {
            findOne: jest.fn(),
            save: jest.fn(),
            create: jest.fn(),
            findAndCount: jest.fn(),
            count: jest.fn(),
          },
        },
        {
          provide: getRepositoryToken(HostReview),
          useValue: {
            findOne: jest.fn(),
            save: jest.fn(),
            create: jest.fn(),
            findAndCount: jest.fn(),
            count: jest.fn(),
          },
        },
        {
          provide: NotificationsService,
          useValue: {
            notify: jest.fn().mockResolvedValue({}),
          },
        },
      ],
    }).compile();

    service = module.get<ReviewModerationService>(ReviewModerationService);
    guestReviewRepository = module.get<Repository<GuestReview>>(
      getRepositoryToken(GuestReview),
    );
    hostReviewRepository = module.get<Repository<HostReview>>(
      getRepositoryToken(HostReview),
    );
    notificationsService = module.get<NotificationsService>(NotificationsService);
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('processModerationForGuestReview', () => {
    it('should auto-approve clean reviews with high confidence', async () => {
      const review: GuestReview = {
        id: 'review-1',
        bookingId: 'booking-1',
        guestId: 'guest-1',
        hostId: 'host-1',
        cleanliness: 5,
        communication: 5,
        respectForRules: 5,
        comment: 'Great experience, very clean and welcoming!',
        wouldHostAgain: true,
        moderationStatus: ReviewModerationStatus.PENDING,
        moderationConfidence: 0,
        moderationReason: '',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const result = await service.processModerationForGuestReview(review);

      expect(result.moderationStatus).toBe(ReviewModerationStatus.APPROVED);
      expect(result.moderationConfidence).toBeGreaterThanOrEqual(0.8);
    });

    it('should flag reviews with prohibited language', async () => {
      const review: GuestReview = {
        id: 'review-1',
        bookingId: 'booking-1',
        guestId: 'guest-1',
        hostId: 'host-1',
        cleanliness: 5,
        communication: 5,
        respectForRules: 5,
        comment: 'This is a scam!',
        wouldHostAgain: true,
        moderationStatus: ReviewModerationStatus.PENDING,
        moderationConfidence: 0,
        moderationReason: '',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const result = await service.processModerationForGuestReview(review);

      expect(result.moderationStatus).toBe(ReviewModerationStatus.PENDING);
      expect(result.moderationConfidence).toBeGreaterThan(0.5);
      expect(result.moderationReason).toContain('prohibited');
    });

    it('should flag reviews with excessive capitalization', async () => {
      const review: GuestReview = {
        id: 'review-1',
        bookingId: 'booking-1',
        guestId: 'guest-1',
        hostId: 'host-1',
        cleanliness: 5,
        communication: 5,
        respectForRules: 5,
        comment: 'TERRIBLE TERRIBLE TERRIBLE PLACE',
        wouldHostAgain: true,
        moderationStatus: ReviewModerationStatus.PENDING,
        moderationConfidence: 0,
        moderationReason: '',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const result = await service.processModerationForGuestReview(review);

      expect(result.moderationStatus).toBe(ReviewModerationStatus.PENDING);
      expect(result.moderationReason).toContain('capitalization');
    });

    it('should flag reviews with repeated characters', async () => {
      const review: GuestReview = {
        id: 'review-1',
        bookingId: 'booking-1',
        guestId: 'guest-1',
        hostId: 'host-1',
        cleanliness: 5,
        communication: 5,
        respectForRules: 5,
        comment: 'This is sooooooo bad',
        wouldHostAgain: true,
        moderationStatus: ReviewModerationStatus.PENDING,
        moderationConfidence: 0,
        moderationReason: '',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const result = await service.processModerationForGuestReview(review);

      expect(result.moderationStatus).toBe(ReviewModerationStatus.PENDING);
      expect(result.moderationReason).toContain('repeated');
    });
  });

  describe('processModerationForHostReview', () => {
    it('should auto-approve clean host reviews', async () => {
      const review: HostReview = {
        id: 'review-1',
        bookingId: 'booking-1',
        guestId: 'guest-1',
        hostId: 'host-1',
        accuracy: 5,
        cleanliness: 5,
        checkIn: 5,
        communication: 5,
        location: 5,
        value: 5,
        comment: 'Amazing property, highly recommend!',
        moderationStatus: HostReviewModerationStatus.PENDING,
        moderationConfidence: 0,
        moderationReason: '',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const result = await service.processModerationForHostReview(review);

      expect(result.moderationStatus).toBe(HostReviewModerationStatus.APPROVED);
      expect(result.moderationConfidence).toBeGreaterThanOrEqual(0.8);
    });

    it('should flag host reviews with spam patterns', async () => {
      const review: HostReview = {
        id: 'review-1',
        bookingId: 'booking-1',
        guestId: 'guest-1',
        hostId: 'host-1',
        accuracy: 5,
        cleanliness: 5,
        checkIn: 5,
        communication: 5,
        location: 5,
        value: 5,
        comment: 'Visit www.spam-site.com and call 555-555-5555',
        moderationStatus: HostReviewModerationStatus.PENDING,
        moderationConfidence: 0,
        moderationReason: '',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const result = await service.processModerationForHostReview(review);

      expect(result.moderationStatus).toBe(HostReviewModerationStatus.PENDING);
      expect(result.moderationConfidence).toBeGreaterThan(0.5);
    });
  });

  describe('getPendingModerationQueue', () => {
    it('should return pending reviews for moderation', async () => {
      const pendingGuest: GuestReview[] = [
        {
          id: 'guest-review-1',
          bookingId: 'booking-1',
          guestId: 'guest-1',
          hostId: 'host-1',
          cleanliness: 5,
          communication: 5,
          respectForRules: 5,
          comment: 'A review',
          wouldHostAgain: true,
          moderationStatus: ReviewModerationStatus.PENDING,
          moderationConfidence: 0.6,
          moderationReason: 'flagged',
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ];

      const pendingHost: HostReview[] = [
        {
          id: 'host-review-1',
          bookingId: 'booking-1',
          guestId: 'guest-1',
          hostId: 'host-1',
          accuracy: 5,
          cleanliness: 5,
          checkIn: 5,
          communication: 5,
          location: 5,
          value: 5,
          comment: 'A review',
          moderationStatus: HostReviewModerationStatus.PENDING,
          moderationConfidence: 0.6,
          moderationReason: 'flagged',
          createdAt: new Date(),
          updatedAt: new Date(),
        },
      ];

      jest.spyOn(guestReviewRepository, 'findAndCount').mockResolvedValue([pendingGuest, 1]);
      jest.spyOn(hostReviewRepository, 'findAndCount').mockResolvedValue([pendingHost, 1]);

      const result = await service.getPendingModerationQueue(1, 20);

      expect(result.guestReviews).toHaveLength(1);
      expect(result.hostReviews).toHaveLength(1);
      expect(result.total).toBe(2);
    });
  });

  describe('approveReview', () => {
    it('should approve a guest review and notify user', async () => {
      const review: GuestReview = {
        id: 'review-1',
        bookingId: 'booking-1',
        guestId: 'guest-1',
        hostId: 'host-1',
        cleanliness: 5,
        communication: 5,
        respectForRules: 5,
        comment: 'Great',
        wouldHostAgain: true,
        moderationStatus: ReviewModerationStatus.PENDING,
        moderationConfidence: 0,
        moderationReason: '',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      jest.spyOn(guestReviewRepository, 'findOne').mockResolvedValue(review);
      jest.spyOn(guestReviewRepository, 'save').mockResolvedValue(review);

      await service.approveReview('review-1', 'guest');

      expect(notificationsService.notify).toHaveBeenCalledWith(
        'host-1',
        'Your review has been approved',
        expect.stringContaining('published'),
        'review_approved',
      );
    });

    it('should approve a host review and notify user', async () => {
      const review: HostReview = {
        id: 'review-1',
        bookingId: 'booking-1',
        guestId: 'guest-1',
        hostId: 'host-1',
        accuracy: 5,
        cleanliness: 5,
        checkIn: 5,
        communication: 5,
        location: 5,
        value: 5,
        comment: 'Great',
        moderationStatus: HostReviewModerationStatus.PENDING,
        moderationConfidence: 0,
        moderationReason: '',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      jest.spyOn(hostReviewRepository, 'findOne').mockResolvedValue(review);
      jest.spyOn(hostReviewRepository, 'save').mockResolvedValue(review);

      await service.approveReview('review-1', 'host');

      expect(notificationsService.notify).toHaveBeenCalledWith(
        'guest-1',
        'Your review has been approved',
        expect.stringContaining('published'),
        'review_approved',
      );
    });
  });

  describe('rejectReview', () => {
    it('should reject a review and notify user', async () => {
      const review: GuestReview = {
        id: 'review-1',
        bookingId: 'booking-1',
        guestId: 'guest-1',
        hostId: 'host-1',
        cleanliness: 5,
        communication: 5,
        respectForRules: 5,
        comment: 'Great',
        wouldHostAgain: true,
        moderationStatus: ReviewModerationStatus.PENDING,
        moderationConfidence: 0,
        moderationReason: '',
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      jest.spyOn(guestReviewRepository, 'findOne').mockResolvedValue(review);
      jest.spyOn(guestReviewRepository, 'save').mockResolvedValue(review);

      await service.rejectReview('review-1', 'guest');

      expect(notificationsService.notify).toHaveBeenCalledWith(
        'host-1',
        'Your review has been rejected',
        expect.stringContaining('guidelines'),
        'review_rejected',
      );
    });
  });
});
