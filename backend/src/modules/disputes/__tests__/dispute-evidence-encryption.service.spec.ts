import { ConfigService } from '@nestjs/config';
import {
  EncryptionError,
  EncryptionService,
} from '../../../common/services/encryption.service';
import { AuditService } from '../../audit/audit.service';
import {
  DisputeEvidenceEncryptionService,
  SealedEvidence,
} from '../dispute-evidence-encryption.service';

const KEY = Buffer.from('a'.repeat(32), 'utf8').toString('base64');
const OTHER_KEY = Buffer.from('b'.repeat(32), 'utf8').toString('base64');

describe('DisputeEvidenceEncryptionService (#26)', () => {
  let service: DisputeEvidenceEncryptionService;
  let audit: { log: jest.Mock };
  let config: { get: (key: string) => string | undefined };

  beforeEach(() => {
    const encryption = new EncryptionService({
      get: (key: string) => (key === 'ENCRYPTION_KEY_BASE64' ? KEY : undefined),
    } as unknown as ConfigService);
    audit = { log: jest.fn().mockResolvedValue(undefined) };
    config = {
      get: jest.fn((key: string) =>
        key === 'ENCRYPTION_KEY_BASE64' ? KEY : undefined,
      ),
    };
    service = new DisputeEvidenceEncryptionService(
      encryption,
      audit as unknown as AuditService,
      config as unknown as ConfigService,
    );
  });

  it('round-trips a known plaintext for an authorised arbiter', () => {
    const sealed = service.sealEvidence('ev-1', 'lease agreement text', [
      'arb-1',
    ]);
    expect(sealed.version).toBe(1);
    expect(sealed.grants).toHaveLength(1);
    expect(sealed.ciphertext).not.toContain('lease agreement text');
    expect(service.openEvidence(sealed, 'arb-1', 'actor-1')).toBe(
      'lease agreement text',
    );
    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({ entityId: 'ev-1', performedBy: 'actor-1' }),
    );
  });

  it('rejects tampered ciphertext and unknown key ids', () => {
    const sealed = service.sealEvidence('ev-2', 'secret', ['arb-1']);
    const parsed = JSON.parse(sealed.ciphertext) as {
      iv: string;
      data: string;
      tag: string;
    };
    const tampered: SealedEvidence = {
      ...sealed,
      ciphertext: JSON.stringify({
        ...parsed,
        data: Buffer.from('different text').toString('base64'),
      }),
    };
    expect(() => service.openEvidence(tampered, 'arb-1', 'actor')).toThrow(
      EncryptionError,
    );

    const otherConfig = {
      get: (key: string) =>
        key === 'ENCRYPTION_KEY_BASE64' ? OTHER_KEY : undefined,
    };
    const otherService = new DisputeEvidenceEncryptionService(
      new EncryptionService(otherConfig as unknown as ConfigService),
      audit as unknown as AuditService,
      otherConfig as unknown as ConfigService,
    );
    expect(() => otherService.openEvidence(sealed, 'arb-1', 'actor')).toThrow(
      EncryptionError,
    );
  });

  it('isolates grants: a different arbiter cannot decrypt', () => {
    const sealed = service.sealEvidence('ev-3', 'private', ['arb-1']);
    expect(() => service.openEvidence(sealed, 'arb-2', 'actor')).toThrow(
      /not granted access/,
    );
    expect(audit.log).toHaveBeenCalledWith(
      expect.objectContaining({
        level: 'WARN',
        metadata: expect.objectContaining({ reason: 'NO_GRANT' }),
      }),
    );
  });

  it('revoked arbiters can no longer unwrap the data key', () => {
    const sealed = service.sealEvidence('ev-4', 'private', ['arb-1', 'arb-2']);
    const revoked = service.revokeAccess(sealed, 'arb-1', 'admin-1');
    expect(revoked.grants.map((g) => g.arbiterId)).toEqual(['arb-2']);
    expect(() => service.openEvidence(revoked, 'arb-1', 'actor')).toThrow(
      /not granted access/,
    );
    expect(service.openEvidence(revoked, 'arb-2', 'actor')).toBe('private');
  });

  it('seals votes until reveal and rejects a modified payload', () => {
    const payload = { favorLandlord: true, reason: 'evidence' };
    const seal = service.sealVote('D-1', 'arb-1', payload);
    expect(seal.commitment).toHaveLength(64);
    expect(JSON.stringify(seal)).not.toContain('favorLandlord');

    expect(service.revealVote(seal, payload, 'actor')).toBe(true);
    expect(
      service.revealVote(seal, { ...payload, favorLandlord: false }, 'actor'),
    ).toBe(false);
  });

  it('encrypts channel messages with a channel-derived key', () => {
    const ciphertext = service.sealChannelMessage('chat-1', 'hello channel');
    expect(ciphertext).not.toContain('hello channel');
    expect(service.openChannelMessage('chat-1', ciphertext)).toBe(
      'hello channel',
    );

    const other = service.sealChannelMessage('chat-2', 'hello channel');
    expect(() => service.openChannelMessage('chat-1', other)).toThrow();
  });

  it('fails clearly when the master key is missing or malformed', () => {
    const badConfig = { get: () => undefined };
    const badService = new DisputeEvidenceEncryptionService(
      new EncryptionService({
        get: (k) => (k === 'ENCRYPTION_KEY_BASE64' ? KEY : undefined),
      } as unknown as ConfigService),
      audit as unknown as AuditService,
      badConfig as unknown as ConfigService,
    );
    expect(() => badService.sealEvidence('ev', 'x', ['a'])).toThrow(
      /master key is not configured/,
    );
  });
});
