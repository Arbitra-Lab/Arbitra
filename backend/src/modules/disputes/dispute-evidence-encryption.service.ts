import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'node:crypto';
import {
  EncryptionError,
  EncryptionService,
  EncryptedData,
} from '../../common/services/encryption.service';
import {
  AuditAction,
  AuditLevel,
  AuditStatus,
} from '../audit/entities/audit-log.entity';
import { AuditService } from '../audit/audit.service';

export interface EvidenceGrant {
  arbiterId: string;
  /** Data key wrapped with a key derived for this arbiter + evidence. */
  wrappedKey: string;
  grantedAt: string;
}

export interface SealedEvidence {
  version: 1;
  evidenceId: string;
  ciphertext: string;
  grants: EvidenceGrant[];
}

export interface VoteSeal {
  version: 1;
  disputeId: string;
  voterId: string;
  nonce: string;
  commitment: string;
  payloadHash: string;
  createdAt: string;
}

export interface VotePayload {
  favorLandlord: boolean;
  [key: string]: unknown;
}

/**
 * Advanced encryption for dispute evidence, selective disclosure, sealed
 * votes and channel messages (#26).
 *
 * All AES-GCM work delegates to the shared `EncryptionService`; this service
 * only manages per-evidence data keys, HKDF-derived wrapping keys and vote
 * commitments. Vote sealing is a commit/reveal HMAC scheme, explicitly NOT a
 * zero-knowledge proof. ZK circuits and a GDPR compliance programme require
 * dedicated infrastructure and are documented as follow-ups.
 */
@Injectable()
export class DisputeEvidenceEncryptionService {
  constructor(
    private readonly encryptionService: EncryptionService,
    private readonly auditService: AuditService,
    private readonly configService: ConfigService,
  ) {}

  /** Encrypt evidence and grant decryption to the listed arbiters only. */
  sealEvidence(
    evidenceId: string,
    plaintext: string,
    arbiterIds: string[],
  ): SealedEvidence {
    const dataKey = crypto.randomBytes(32);
    const grants = Array.from(new Set(arbiterIds)).map((arbiterId) => ({
      arbiterId,
      wrappedKey: this.encryptionService.encryptWithKey(
        dataKey.toString('base64'),
        this.deriveKey(`grant:${evidenceId}:${arbiterId}`),
      ),
      grantedAt: new Date().toISOString(),
    }));

    return {
      version: 1,
      evidenceId,
      ciphertext: this.encryptionService.encryptWithKey(plaintext, dataKey),
      grants,
    };
  }

  /**
   * Decrypt evidence on behalf of an authorised arbiter. Every attempt is
   * audit logged (#26 access patterns), including denials.
   */
  openEvidence(
    sealed: SealedEvidence,
    arbiterId: string,
    actorId: string,
  ): string {
    const grant = sealed.grants.find((entry) => entry.arbiterId === arbiterId);
    if (!grant) {
      void this.auditService.log({
        action: AuditAction.DATA_ACCESS,
        entityType: 'DisputeEvidence',
        entityId: sealed.evidenceId,
        performedBy: actorId,
        status: AuditStatus.FAILURE,
        level: AuditLevel.WARN,
        metadata: { arbiterId, reason: 'NO_GRANT' },
      });
      throw new EncryptionError(
        'Arbiter is not granted access to this evidence',
      );
    }

    try {
      const wrappingKey = this.deriveKey(
        `grant:${sealed.evidenceId}:${arbiterId}`,
      );
      const dataKeyB64 = this.encryptionService.decryptWithKey(
        JSON.parse(grant.wrappedKey) as EncryptedData,
        wrappingKey,
      );
      const plaintext = this.encryptionService.decryptWithKey(
        JSON.parse(sealed.ciphertext) as EncryptedData,
        Buffer.from(dataKeyB64, 'base64'),
      );
      void this.auditService.log({
        action: AuditAction.DATA_ACCESS,
        entityType: 'DisputeEvidence',
        entityId: sealed.evidenceId,
        performedBy: actorId,
        level: AuditLevel.INFO,
        metadata: { arbiterId, result: 'DECRYPTED' },
      });
      return plaintext;
    } catch {
      void this.auditService.log({
        action: AuditAction.DATA_ACCESS,
        entityType: 'DisputeEvidence',
        entityId: sealed.evidenceId,
        performedBy: actorId,
        level: AuditLevel.WARN,
        metadata: { arbiterId, reason: 'DECRYPTION_FAILED' },
      });
      throw new EncryptionError('Evidence decryption failed');
    }
  }

  /** Remove an arbiter's grant. Revoked arbiters can no longer unwrap. */
  revokeAccess(
    sealed: SealedEvidence,
    arbiterId: string,
    actorId: string,
  ): SealedEvidence {
    const updated: SealedEvidence = {
      ...sealed,
      grants: sealed.grants.filter((grant) => grant.arbiterId !== arbiterId),
    };
    void this.auditService.log({
      action: AuditAction.PERMISSION_CHANGE,
      entityType: 'DisputeEvidence',
      entityId: sealed.evidenceId,
      performedBy: actorId,
      metadata: { arbiterId, result: 'ACCESS_REVOKED' },
    });
    return updated;
  }

  /** Create a confidential vote commitment; the vote stays hidden until reveal. */
  sealVote(disputeId: string, voterId: string, payload: VotePayload): VoteSeal {
    const nonce = crypto.randomBytes(16).toString('base64');
    const canonical = this.canonicalVote(disputeId, voterId, payload);
    return {
      version: 1,
      disputeId,
      voterId,
      nonce,
      commitment: this.hmac(`${canonical}:${nonce}`),
      payloadHash: crypto.createHash('sha256').update(canonical).digest('hex'),
      createdAt: new Date().toISOString(),
    };
  }

  /** Verify a revealed vote against its commitment and audit the outcome. */
  revealVote(seal: VoteSeal, payload: VotePayload, actorId: string): boolean {
    const canonical = this.canonicalVote(seal.disputeId, seal.voterId, payload);
    const expectedHash = crypto
      .createHash('sha256')
      .update(canonical)
      .digest('hex');
    const valid =
      expectedHash === seal.payloadHash &&
      this.constantTimeEqual(
        this.hmac(`${canonical}:${seal.nonce}`),
        seal.commitment,
      );

    void this.auditService.log({
      action: AuditAction.DATA_ACCESS,
      entityType: 'DisputeVote',
      entityId: seal.disputeId,
      performedBy: actorId,
      level: valid ? AuditLevel.INFO : AuditLevel.WARN,
      metadata: {
        voterId: seal.voterId,
        result: valid ? 'VERIFIED' : 'MISMATCH',
      },
    });
    return valid;
  }

  /** Encrypt a channel message with a key derived from the channel id. */
  sealChannelMessage(channelId: string, plaintext: string): string {
    return this.encryptionService.encryptWithKey(
      plaintext,
      this.deriveKey(`channel:${channelId}`),
    );
  }

  openChannelMessage(channelId: string, ciphertext: string): string {
    return this.encryptionService.decryptWithKey(
      JSON.parse(ciphertext) as EncryptedData,
      this.deriveKey(`channel:${channelId}`),
    );
  }

  private canonicalVote(
    disputeId: string,
    voterId: string,
    payload: VotePayload,
  ): string {
    const keys = Object.keys(payload).sort();
    const normalized = keys
      .map((key) => `${key}=${String(payload[key])}`)
      .join('&');
    return `${disputeId}:${voterId}:${normalized}`;
  }

  private hmac(value: string): string {
    return crypto
      .createHmac('sha256', this.masterKey())
      .update(value)
      .digest('hex');
  }

  private constantTimeEqual(a: string, b: string): boolean {
    const left = Buffer.from(a);
    const right = Buffer.from(b);
    return left.length === right.length && crypto.timingSafeEqual(left, right);
  }

  private deriveKey(context: string): Buffer {
    return Buffer.from(
      crypto.hkdfSync(
        'sha256',
        this.masterKey(),
        Buffer.alloc(0),
        Buffer.from(context, 'utf8'),
        32,
      ),
    );
  }

  private masterKey(): Buffer {
    const configured =
      this.configService.get<string>('EVIDENCE_MASTER_KEY_BASE64') ??
      this.configService.get<string>('ENCRYPTION_KEY_BASE64');
    if (!configured) {
      throw new EncryptionError('Evidence master key is not configured');
    }
    const key = Buffer.from(configured, 'base64');
    if (key.length !== 32) {
      throw new EncryptionError('Evidence master key must be 32 bytes');
    }
    return key;
  }
}
