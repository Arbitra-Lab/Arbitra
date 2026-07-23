import { Injectable, Logger } from '@nestjs/common';
import {
  Dispute,
  DisputePriority,
  DisputeStatus,
} from './entities/dispute.entity';
import { Arbiter } from './entities/arbiter.entity';
import { User } from '../users/entities/user.entity';
import { RentAgreement } from '../rent/entities/rent-contract.entity';

export interface DisputeSlaEscalationData {
  dispute: Dispute;
  previousPriority: DisputePriority;
  newPriority: DisputePriority;
  previousArbiterId: number | null;
  newArbiter: Arbiter | null;
  dueAt: Date | null;
}

export interface DisputeNotificationData {
  dispute: Dispute;
  agreement: RentAgreement;
  initiator: User;
  recipient?: User;
  action:
    | 'created'
    | 'evidence_added'
    | 'comment_added'
    | 'status_updated'
    | 'resolved';
  additionalData?: any;
}

@Injectable()
export class DisputeNotificationService {
  private readonly logger = new Logger(DisputeNotificationService.name);
  /**
   * Send notification for dispute creation
   */
  async notifyDisputeCreated(data: DisputeNotificationData): Promise<void> {
    const { dispute, agreement, initiator } = data;

    // Notify the other party (landlord or tenant)
    const otherPartyId =
      agreement.adminId === initiator.id ? agreement.userId : agreement.adminId;

    await this.sendNotification({
      userId: otherPartyId,
      type: 'DISPUTE_CREATED',
      title: 'New Dispute Filed',
      message: `A new dispute has been filed for your rental agreement. Type: ${dispute.disputeType}`,
      data: {
        disputeId: dispute.disputeId,
        agreementId: agreement.id,
        disputeType: dispute.disputeType,
        initiatedBy: initiator.firstName || initiator.email,
      },
    });

    // Notify admins
    await this.notifyAdmins(
      dispute,
      'NEW_DISPUTE',
      'New Dispute Requires Review',
    );
  }

  /**
   * Send notification for evidence added
   */
  async notifyEvidenceAdded(data: DisputeNotificationData): Promise<void> {
    const { dispute, agreement, initiator } = data;

    // Notify the other party
    const otherPartyId =
      agreement.adminId === initiator.id ? agreement.userId : agreement.adminId;

    await this.sendNotification({
      userId: otherPartyId,
      type: 'EVIDENCE_ADDED',
      title: 'New Evidence Added',
      message: `New evidence has been added to the dispute for your rental agreement.`,
      data: {
        disputeId: dispute.disputeId,
        agreementId: agreement.id,
        addedBy: initiator.firstName || initiator.email,
      },
    });
  }

  /**
   * Send notification for comment added
   */
  async notifyCommentAdded(data: DisputeNotificationData): Promise<void> {
    const { dispute, agreement, initiator, additionalData } = data;
    const { isInternal } = additionalData || {};

    if (isInternal) {
      // Internal comments only go to admins
      await this.notifyAdmins(
        dispute,
        'INTERNAL_COMMENT',
        'New Internal Comment',
      );
    } else {
      // Public comments notify all parties
      const otherPartyId =
        agreement.adminId === initiator.id
          ? agreement.userId
          : agreement.adminId;

      await this.sendNotification({
        userId: otherPartyId,
        type: 'COMMENT_ADDED',
        title: 'New Comment Added',
        message: `A new comment has been added to the dispute for your rental agreement.`,
        data: {
          disputeId: dispute.disputeId,
          agreementId: agreement.id,
          commentBy: initiator.firstName || initiator.email,
        },
      });
    }
  }

  /**
   * Send notification for dispute status update
   */
  async notifyStatusUpdated(data: DisputeNotificationData): Promise<void> {
    const { dispute, agreement, initiator } = data;

    // Notify all parties
    const parties = [agreement.adminId, agreement.userId].filter(
      (id) => id !== initiator.id,
    );

    for (const partyId of parties) {
      await this.sendNotification({
        userId: partyId,
        type: 'DISPUTE_STATUS_UPDATED',
        title: 'Dispute Status Updated',
        message: `The dispute status has been updated to: ${dispute.status}`,
        data: {
          disputeId: dispute.disputeId,
          agreementId: agreement.id,
          newStatus: dispute.status,
          updatedBy: initiator.firstName || initiator.email,
        },
      });
    }

    // Notify admins if status requires attention
    if (dispute.status === DisputeStatus.UNDER_REVIEW) {
      await this.notifyAdmins(
        dispute,
        'DISPUTE_UNDER_REVIEW',
        'Dispute Under Review',
      );
    }
  }

  /**
   * Send notification for dispute resolution
   */
  async notifyDisputeResolved(data: DisputeNotificationData): Promise<void> {
    const { dispute, agreement, initiator } = data;

    // Notify all parties
    const parties = [agreement.adminId, agreement.userId];

    for (const partyId of parties) {
      await this.sendNotification({
        userId: partyId,
        type: 'DISPUTE_RESOLVED',
        title: 'Dispute Resolved',
        message: `The dispute for your rental agreement has been resolved.`,
        data: {
          disputeId: dispute.disputeId,
          agreementId: agreement.id,
          resolution: dispute.resolution,
          resolvedBy: initiator.firstName || initiator.email,
        },
      });
    }
  }

  /**
   * Notify admins (and the newly assigned arbiter, if any) that a dispute
   * breached its stage SLA and was escalated.
   */
  async notifySlaEscalation(data: DisputeSlaEscalationData): Promise<void> {
    const { dispute, previousPriority, newPriority, newArbiter, dueAt } = data;

    await this.notifyAdmins(
      dispute,
      'DISPUTE_SLA_BREACHED',
      `SLA breached (due ${dueAt?.toISOString()}) — priority raised from ${previousPriority} to ${newPriority}`,
    );

    if (newArbiter?.userId) {
      await this.sendNotification({
        userId: String(newArbiter.userId),
        type: 'DISPUTE_REASSIGNED_ESCALATION',
        title: 'Dispute Reassigned After SLA Breach',
        message: `You have been assigned dispute ${dispute.disputeId} after it breached its SLA.`,
        data: {
          disputeId: dispute.disputeId,
          priority: newPriority,
          dueAt,
        },
      });
    }
  }

  /**
   * Notify all admins about a dispute
   */
  private async notifyAdmins(
    dispute: Dispute,
    type: string,
    title: string,
  ): Promise<void> {
    this.logger.log(
      `Admin notification: ${title} - Dispute ${dispute.disputeId}`,
    );
  }

  private async sendNotification(notification: {
    userId: string;
    type: string;
    title: string;
    message: string;
    data: any;
  }): Promise<void> {
    this.logger.debug(`Notification sent to user ${notification.userId}:`, {
      type: notification.type,
      title: notification.title,
      message: notification.message,
      data: notification.data,
    });
  }
}
