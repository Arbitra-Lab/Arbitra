import { Injectable, Logger } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, DataSource, In } from 'typeorm';
import {
  Dispute,
  DisputeStatus,
  DisputeStage,
  DisputePriority,
} from './entities/dispute.entity';
import { DisputeEvidence } from './entities/dispute-evidence.entity';
import { DisputeComment } from './entities/dispute-comment.entity';
import {
  DisputeEvent,
  DisputeEventType,
} from './entities/dispute-event.entity';
import {
  RentAgreement,
  AgreementStatus,
} from '../rent/entities/rent-contract.entity';
import { User, UserRole } from '../users/entities/user.entity';
import { CreateDisputeDto } from './dto/create-dispute.dto';
import { AddEvidenceDto } from './dto/add-evidence.dto';
import { AddCommentDto } from './dto/add-comment.dto';
import { ResolveDisputeDto } from './dto/resolve-dispute.dto';
import { UpdateDisputeDto } from './dto/update-dispute.dto';
import { QueryDisputesDto } from './dto/query-disputes.dto';
import { AuditService } from '../audit/audit.service';
import { AuditAction, AuditLevel } from '../audit/entities/audit-log.entity';
import { AuditLog } from '../audit/decorators/audit-log.decorator';
import { randomUUID } from 'crypto';
import { Locked, LockService } from '../../common/lock';
import { Idempotent, IdempotencyService } from '../../common/idempotency';
import {
  AgreementNotFoundError,
  UserNotFoundError,
  AuthorizationError,
  BusinessRuleViolationError,
  DisputeNotFoundError,
  ValidationError,
} from '../../common/errors/domain-errors';
import { DisputeSlaService, DisputeSlaState } from './dispute-sla.service';
import { DisputeAssignmentService } from './dispute-assignment.service';

export interface DisputeSlaStatusDto {
  disputeId: string;
  stage: DisputeStage | null;
  status: DisputeSlaState;
  dueAt: Date | null;
  msRemainingMs: number | null;
  priority: DisputePriority;
  escalationCount: number;
  assignedArbiterId: number | null;
}

@Injectable()
export class DisputesService {
  private readonly logger = new Logger(DisputesService.name);

  constructor(
    @InjectRepository(Dispute)
    private readonly disputeRepository: Repository<Dispute>,
    @InjectRepository(DisputeEvidence)
    private readonly evidenceRepository: Repository<DisputeEvidence>,
    @InjectRepository(DisputeComment)
    private readonly commentRepository: Repository<DisputeComment>,
    @InjectRepository(DisputeEvent)
    private readonly eventRepository: Repository<DisputeEvent>,
    @InjectRepository(RentAgreement)
    private readonly agreementRepository: Repository<RentAgreement>,
    @InjectRepository(User)
    private readonly userRepository: Repository<User>,
    private readonly auditService: AuditService,
    private readonly dataSource: DataSource,
    private readonly lockService: LockService,
    private readonly idempotencyService: IdempotencyService,
    private readonly slaService: DisputeSlaService,
    private readonly assignmentService: DisputeAssignmentService,
  ) {}

  /**
   * Create a new dispute
   */
  @AuditLog({
    action: AuditAction.CREATE,
    entityType: 'Dispute',
    level: AuditLevel.INFO,
    includeNewValues: true,
  })
  @Locked({
    key: (createDisputeDto: CreateDisputeDto) =>
      `dispute:create:${createDisputeDto.agreementId}`,
    ttlMs: 10000,
  })
  @Idempotent({
    ttlMs: 2_592_000_000,
    key: (createDisputeDto: CreateDisputeDto, userId: string) =>
      createDisputeDto.idempotencyKey
        ? `dispute:create:${userId}:${createDisputeDto.idempotencyKey}`
        : null,
    requireKey: false,
  })
  async createDispute(
    createDisputeDto: CreateDisputeDto,
    userId: string,
  ): Promise<Dispute> {
    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      // Validate agreement exists and user has permission
      const agreement = await queryRunner.manager.findOne(RentAgreement, {
        where: { id: createDisputeDto.agreementId },
        relations: ['landlord', 'tenant'],
      });

      if (!agreement) {
        throw new AgreementNotFoundError(createDisputeDto.agreementId);
      }

      // Check if user is party to the agreement
      const user = await queryRunner.manager.findOne(User, {
        where: { id: userId },
      });

      if (!user) {
        throw new UserNotFoundError(userId);
      }

      const isLandlord = agreement.adminId === user.id;
      const isTenant = agreement.userId === user.id;

      if (!isLandlord && !isTenant && user.role !== UserRole.ADMIN) {
        throw new AuthorizationError(
          'You can only create disputes for agreements you are party to',
        );
      }

      // Check if there's already an active dispute for this agreement
      const existingDispute = await queryRunner.manager.findOne(Dispute, {
        where: {
          agreementId: parseInt(createDisputeDto.agreementId),
          status: In([DisputeStatus.OPEN, DisputeStatus.UNDER_REVIEW]),
        },
      });

      if (existingDispute) {
        throw new BusinessRuleViolationError(
          'There is already an active dispute for this agreement',
        );
      }

      // Create dispute
      const initialStage = DisputeStage.INTAKE;
      const dispute = queryRunner.manager.create(Dispute, {
        disputeId: randomUUID(),
        agreement: agreement,
        initiatedBy: user.id,
        disputeType: createDisputeDto.disputeType,
        requestedAmount: createDisputeDto.requestedAmount,
        description: createDisputeDto.description,
        status: DisputeStatus.OPEN,
        stage: initialStage,
        stageDueAt: this.slaService.computeStageDueDate(initialStage),
        priority: DisputePriority.NORMAL,
        escalationCount: 0,
        metadata: createDisputeDto.metadata
          ? JSON.parse(createDisputeDto.metadata)
          : null,
      } as any);

      const savedDispute = await queryRunner.manager.save(dispute);

      // Update agreement status to disputed
      await queryRunner.manager.update(RentAgreement, agreement.id, {
        status: AgreementStatus.DISPUTED,
      });

      await queryRunner.commitTransaction();

      // Auto-assign an arbiter (best-effort — creation must not fail if no
      // eligible arbiter is available).
      await this.tryAutoAssignArbiter(savedDispute.id);

      // Return dispute with relations
      return this.findOne(savedDispute.id);
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  /**
   * Weighted auto-assignment for a freshly created dispute. Never throws —
   * failing to find an eligible arbiter simply leaves the dispute
   * unassigned for manual/reconciler follow-up.
   */
  private async tryAutoAssignArbiter(disputeId: number): Promise<void> {
    try {
      const dispute = await this.findOne(disputeId);
      const arbiter = await this.assignmentService.assignArbiter(dispute);
      if (!arbiter) return;

      await this.disputeRepository.update(dispute.id, {
        assignedArbiterId: arbiter.id,
      });

      await this.recordDisputeEvent(
        dispute,
        DisputeEventType.ARBITER_ASSIGNED,
        {
          arbiterId: arbiter.id,
          reason: 'auto_assignment_on_create',
        },
      );
    } catch (error) {
      this.logger.warn(
        `Auto-assignment failed for dispute ${disputeId}: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }

  /**
   * Get all disputes with filtering and pagination
   */
  async findAll(
    query: QueryDisputesDto,
    _userId?: string,
  ): Promise<{ disputes: Dispute[]; total: number }> {
    const queryBuilder = this.disputeRepository
      .createQueryBuilder('dispute')
      .leftJoinAndSelect('dispute.agreement', 'agreement')
      .leftJoinAndSelect('dispute.initiator', 'initiator')
      .leftJoinAndSelect('dispute.resolver', 'resolver')
      .leftJoinAndSelect('dispute.evidence', 'evidence')
      .leftJoinAndSelect('dispute.comments', 'comments')
      .leftJoinAndSelect('comments.user', 'commentUser');

    // Apply filters
    if (query.status) {
      queryBuilder.andWhere('dispute.status = :status', {
        status: query.status,
      });
    }

    if (query.disputeType) {
      queryBuilder.andWhere('dispute.disputeType = :disputeType', {
        disputeType: query.disputeType,
      });
    }

    if (query.agreementId) {
      queryBuilder.andWhere('dispute.agreementId = :agreementId', {
        agreementId: query.agreementId,
      });
    }

    if (query.initiatedBy) {
      queryBuilder.andWhere('dispute.initiatedBy = :initiatedBy', {
        initiatedBy: query.initiatedBy,
      });
    }

    if (query.disputeIds && query.disputeIds.length > 0) {
      queryBuilder.andWhere('dispute.disputeId IN (:...disputeIds)', {
        disputeIds: query.disputeIds,
      });
    }

    // Apply sorting
    const sortField =
      query.sortBy === 'createdAt'
        ? 'dispute.createdAt'
        : query.sortBy === 'status'
          ? 'dispute.status'
          : 'dispute.createdAt';
    queryBuilder.orderBy(sortField, query.sortOrder);

    // Apply pagination
    const skip = ((query?.page || 1) - 1) * (query?.limit || 10);
    queryBuilder.skip(skip).take(query?.limit || 10);

    const [disputes, total] = await queryBuilder.getManyAndCount();

    return { disputes, total };
  }

  /**
   * Get a single dispute by ID
   */
  async findOne(id: number): Promise<Dispute> {
    const dispute = await this.disputeRepository.findOne({
      where: { id },
      relations: [
        'agreement',
        'initiator',
        'resolver',
        'evidence',
        'evidence.uploader',
        'comments',
        'comments.user',
      ],
    });

    if (!dispute) {
      throw new DisputeNotFoundError(id.toString());
    }

    return dispute;
  }

  /**
   * Get a dispute by disputeId
   */
  async findByDisputeId(disputeId: string): Promise<Dispute> {
    const dispute = await this.disputeRepository.findOne({
      where: { disputeId },
      relations: [
        'agreement',
        'initiator',
        'resolver',
        'evidence',
        'evidence.uploader',
        'comments',
        'comments.user',
      ],
    });

    if (!dispute) {
      throw new DisputeNotFoundError(disputeId);
    }

    return dispute;
  }

  /**
   * Update a dispute
   */
  @AuditLog({
    action: AuditAction.UPDATE,
    entityType: 'Dispute',
    level: AuditLevel.INFO,
    includeOldValues: true,
    includeNewValues: true,
  })
  async update(
    id: number,
    updateDisputeDto: UpdateDisputeDto,
    userId: string,
  ): Promise<Dispute> {
    const dispute = await this.findOne(id);

    // Check permissions
    await this.checkDisputePermission(dispute, userId, 'update');

    // Validate status transitions
    if (
      updateDisputeDto.status &&
      !this.isValidStatusTransition(dispute.status, updateDisputeDto.status)
    ) {
      throw new BusinessRuleViolationError(
        `Invalid status transition from ${dispute.status} to ${updateDisputeDto.status}`,
      );
    }

    const previousStatus = dispute.status;
    Object.assign(dispute, updateDisputeDto);

    if (updateDisputeDto.status && updateDisputeDto.status !== previousStatus) {
      const newStage = this.slaService.stageForStatus(updateDisputeDto.status);
      dispute.stage = newStage;
      dispute.stageDueAt = newStage
        ? this.slaService.computeStageDueDate(newStage)
        : null;

      await this.recordDisputeEvent(
        dispute,
        DisputeEventType.STAGE_TRANSITIONED,
        {
          from: previousStatus,
          to: updateDisputeDto.status,
          stage: dispute.stage,
          dueAt: dispute.stageDueAt,
        },
      );
    }

    return this.disputeRepository.save(dispute);
  }

  /**
   * Add evidence to a dispute
   */
  async addEvidence(
    disputeId: string,
    file: any,
    userId: string,
    dto?: AddEvidenceDto,
  ): Promise<DisputeEvidence> {
    const dispute = await this.findByDisputeId(disputeId);

    // Check permissions
    await this.checkDisputePermission(dispute, userId, 'add_evidence');

    // Validate file
    this.validateFile(file);

    // Create evidence record
    const evidence = this.evidenceRepository.create({
      dispute: dispute,
      uploadedBy: parseInt(userId),
      fileUrl: file.path, // This would be replaced with actual file storage URL
      fileName: file.originalname,
      fileType: file.mimetype,
      fileSize: file.size,
      description: dto?.description,
    });

    return this.evidenceRepository.save(evidence);
  }

  /**
   * Add comment to a dispute
   */
  async addComment(
    disputeId: string,
    addCommentDto: AddCommentDto,
    userId: string,
  ): Promise<DisputeComment> {
    const dispute = await this.findByDisputeId(disputeId);

    // Check permissions
    await this.checkDisputePermission(dispute, userId, 'comment');

    // Only admins can add internal comments
    const user = await this.userRepository.findOne({ where: { id: userId } });
    if (addCommentDto.isInternal && user?.role !== UserRole.ADMIN) {
      throw new AuthorizationError('Only admins can add internal comments');
    }

    const comment = this.commentRepository.create({
      dispute: dispute,
      userId: parseInt(userId),
      content: addCommentDto.content,
      isInternal: addCommentDto.isInternal || false,
    });

    return this.commentRepository.save(comment);
  }

  /**
   * Resolve a dispute
   */
  @AuditLog({
    action: AuditAction.UPDATE,
    entityType: 'Dispute',
    level: AuditLevel.INFO,
    includeOldValues: true,
    includeNewValues: true,
  })
  @Locked({
    key: (disputeId: string) => `dispute:resolve:${disputeId}`,
    ttlMs: 10000,
  })
  async resolveDispute(
    disputeId: string,
    resolveDisputeDto: ResolveDisputeDto,
    userId: string,
  ): Promise<Dispute> {
    const dispute = await this.findByDisputeId(disputeId);

    // Only admins can resolve disputes
    const user = await this.userRepository.findOne({ where: { id: userId } });
    if (user?.role !== UserRole.ADMIN) {
      throw new AuthorizationError('Only admins can resolve disputes');
    }

    if (dispute.status !== DisputeStatus.UNDER_REVIEW) {
      throw new BusinessRuleViolationError(
        'Only disputes under review can be resolved',
      );
    }

    const queryRunner = this.dataSource.createQueryRunner();
    await queryRunner.connect();
    await queryRunner.startTransaction();

    try {
      // Update dispute
      await queryRunner.manager.update(Dispute, dispute.id, {
        status: DisputeStatus.RESOLVED,
        resolution: resolveDisputeDto.resolution,
        resolvedBy: parseInt(userId),
        resolvedAt: new Date(),
        stage: null,
        stageDueAt: null,
      });

      // Update agreement status if needed
      if (dispute.agreement.status === AgreementStatus.DISPUTED) {
        await queryRunner.manager.update(RentAgreement, dispute.agreement.id, {
          status: AgreementStatus.ACTIVE,
        });
      }

      await queryRunner.commitTransaction();

      return this.findByDisputeId(disputeId);
    } catch (error) {
      await queryRunner.rollbackTransaction();
      throw error;
    } finally {
      await queryRunner.release();
    }
  }

  /**
   * Get disputes for a specific agreement
   */
  async getAgreementDisputes(
    agreementId: string,
    userId?: string,
  ): Promise<Dispute[]> {
    const agreement = await this.agreementRepository.findOne({
      where: { id: agreementId },
      relations: ['landlord', 'tenant'],
    });

    if (!agreement) {
      throw new AgreementNotFoundError(agreementId);
    }

    if (userId) {
      const user = await this.userRepository.findOne({ where: { id: userId } });
      const isLandlord = agreement.adminId === user?.id;
      const isTenant = agreement.userId === user?.id;
      const isAdmin = user?.role === UserRole.ADMIN;

      if (!isLandlord && !isTenant && !isAdmin) {
        throw new AuthorizationError(
          'You can only view disputes for agreements you are party to',
        );
      }
    }

    return this.disputeRepository.find({
      where: { agreementId: parseInt(agreementId) },
      relations: ['initiator', 'resolver', 'evidence', 'comments'],
      order: { createdAt: 'DESC' },
    });
  }

  /**
   * SLA status (on-track / at-risk / breached) and time remaining for a
   * single dispute.
   */
  getDisputeSlaStatus(dispute: Dispute): DisputeSlaStatusDto {
    const result = this.slaService.getSlaStatus(
      dispute.stageDueAt,
      dispute.stage,
    );

    return {
      disputeId: dispute.disputeId,
      stage: dispute.stage,
      status: result.status,
      dueAt: dispute.stageDueAt,
      msRemainingMs: result.msRemaining,
      priority: dispute.priority,
      escalationCount: dispute.escalationCount,
      assignedArbiterId: dispute.assignedArbiterId,
    };
  }

  async getSlaStatusByDisputeId(
    disputeId: string,
  ): Promise<DisputeSlaStatusDto> {
    const dispute = await this.findByDisputeId(disputeId);
    return this.getDisputeSlaStatus(dispute);
  }

  /**
   * SLA status and time-remaining for every active (non-terminal) dispute.
   */
  async getActiveDisputesSlaStatus(): Promise<DisputeSlaStatusDto[]> {
    const disputes = await this.disputeRepository.find({
      where: { status: In([DisputeStatus.OPEN, DisputeStatus.UNDER_REVIEW]) },
    });

    return disputes.map((dispute) => this.getDisputeSlaStatus(dispute));
  }

  private async recordDisputeEvent(
    dispute: Dispute,
    eventType: DisputeEventType,
    eventData: Record<string, any>,
  ): Promise<void> {
    const event = this.eventRepository.create({
      disputeId: dispute.disputeId,
      eventType,
      eventData,
      timestamp: new Date(),
      triggeredBy: 'system',
    });

    await this.eventRepository.save(event);
  }

  /**
   * Check if user has permission to perform action on dispute
   */
  private async checkDisputePermission(
    dispute: Dispute,
    userId: string,
    action: string,
  ): Promise<void> {
    const user = await this.userRepository.findOne({ where: { id: userId } });
    if (!user) {
      throw new UserNotFoundError(userId);
    }

    const isInitiator = dispute.initiatedBy.toString() === userId;
    const isLandlord = dispute.agreement.adminId?.toString() === userId;
    const isTenant = dispute.agreement.userId?.toString() === userId;
    const isAdmin = user.role === UserRole.ADMIN;

    if (!isAdmin && !isInitiator && !isLandlord && !isTenant) {
      throw new AuthorizationError(
        'You do not have permission to perform this action on this dispute',
      );
    }

    // Additional restrictions based on action
    if (
      action === 'update' &&
      !isAdmin &&
      dispute.status !== DisputeStatus.OPEN
    ) {
      throw new AuthorizationError(
        'Only admins can update disputes that are not open',
      );
    }
  }

  /**
   * Validate status transition
   */
  private isValidStatusTransition(
    currentStatus: DisputeStatus,
    newStatus: DisputeStatus,
  ): boolean {
    const validTransitions = {
      [DisputeStatus.OPEN]: [
        DisputeStatus.UNDER_REVIEW,
        DisputeStatus.WITHDRAWN,
      ],
      [DisputeStatus.UNDER_REVIEW]: [
        DisputeStatus.RESOLVED,
        DisputeStatus.REJECTED,
        DisputeStatus.OPEN,
      ],
      [DisputeStatus.RESOLVED]: [], // Terminal state
      [DisputeStatus.REJECTED]: [DisputeStatus.OPEN], // Can be reopened
      [DisputeStatus.WITHDRAWN]: [], // Terminal state
    };

    return (
      validTransitions[currentStatus as string]?.includes(
        newStatus as string,
      ) || false
    );
  }

  /**
   * Validate uploaded file
   */
  private validateFile(file: any): void {
    const allowedTypes = [
      'image/jpeg',
      'image/png',
      'image/gif',
      'application/pdf',
      'text/plain',
      'application/msword',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    ];

    const maxSize = 10 * 1024 * 1024; // 10MB

    if (!allowedTypes.includes(file.mimetype)) {
      throw new ValidationError(
        'Invalid file type. Only images, PDFs, and documents are allowed',
      );
    }

    if (file.size > maxSize) {
      throw new ValidationError('File size too large. Maximum size is 10MB');
    }
  }
}
