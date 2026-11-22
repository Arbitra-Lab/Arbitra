import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as crypto from 'node:crypto';
import { BaseAppError } from '../errors/base.error';
import { ErrorCode } from '../errors/error-codes';
import { HttpStatus } from '@nestjs/common';

export interface EncryptedData {
  iv: string; // base64
  data: string; // base64
  tag: string; // base64 auth tag
}

/** New envelopes carry a version and key id for constant-time key lookup. */
export interface VersionedEncryptedData extends EncryptedData {
  version: 2;
  keyId: string;
}

export class EncryptionError extends BaseAppError {
  constructor(message?: string, context?: Record<string, unknown>) {
    super(
      ErrorCode.ENCRYPTION_ERROR,
      HttpStatus.INTERNAL_SERVER_ERROR,
      message,
      false,
      context,
    );
  }
}

export class DecryptionFailedError extends BaseAppError {
  constructor(message?: string, context?: Record<string, unknown>) {
    super(
      ErrorCode.DECRYPTION_ERROR,
      HttpStatus.BAD_REQUEST,
      message || 'Decryption failed: invalid data, key, or tampered',
      true,
      context,
    );
  }
}

/**
 * Centralized AES-256-GCM Encryption Service
 *
 * Features:
 * - AES-256-GCM (authenticated encryption)
 * - Multiple keys for rotation (newest first)
 * - Simple API: encrypt/decrypt strings
 *
 * Env vars:
 * - ENCRYPTION_KEY_BASE64: single 32-byte base64 key (fallback)
 * - ENCRYPTION_KEYS: JSON array of base64 keys '["key1","key2"]' (newest first)
 *
 * Usage:
 * ```ts
 * const encrypted = await this.encryptionService.encrypt('sensitive data');
 * const decrypted = await this.encryptionService.decrypt(encrypted);
 * ```
 *
 * Rotation: Add new key to ENCRYPTION_KEYS array (prepend).
 * Decrypt tries keys in order until success.
 */
@Injectable()
export class EncryptionService {
  private readonly logger = new Logger(EncryptionService.name);
  private keys: Buffer[] = [];
  /** Stable, non-secret fingerprints used as key identifiers (#26). */
  private readonly keyMap = new Map<string, Buffer>();

  constructor(private configService: ConfigService) {
    this.initializeKeys();
  }

  private initializeKeys(): void {
    try {
      // Multi-key rotation support (newest first)
      const keysJson = this.configService.get<string>('ENCRYPTION_KEYS');
      if (keysJson) {
        const keyStrings = JSON.parse(keysJson) as string[];
        this.keys = keyStrings.map((k) => Buffer.from(k, 'base64'));
        this.logger.log(`Loaded ${this.keys.length} rotation keys`);
      } else {
        // Fallback single key
        const keyB64 = this.configService.get<string>('ENCRYPTION_KEY_BASE64');
        if (!keyB64) {
          throw new Error('ENCRYPTION_KEY_BASE64 or ENCRYPTION_KEYS required');
        }
        this.keys = [Buffer.from(keyB64, 'base64')];
        this.logger.log('Loaded single encryption key');
      }

      // Validate key length (AES-256 needs 32 bytes)
      if (this.keys.some((k) => k.length !== 32)) {
        throw new Error(
          'All encryption keys must be 32 bytes (base64 ~44 chars)',
        );
      }
      this.rebuildKeyMap();
    } catch (error) {
      this.logger.error('Encryption key init failed', error);
      throw new EncryptionError(
        `Invalid encryption keys: ${(error as Error).message}`,
      );
    }
  }

  async encrypt(plain: string): Promise<string> {
    if (!plain || typeof plain !== 'string') {
      throw new EncryptionError('Plain text must be non-empty string');
    }

    // Use newest key (index 0)
    const key = this.keys[0];
    const iv = crypto.randomBytes(12); // GCM recommends 12 bytes
    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);

    const data = Buffer.from(plain, 'utf8');
    const encrypted = cipher.update(data);
    cipher.final();

    const tag = cipher.getAuthTag();

    const result: EncryptedData = {
      iv: iv.toString('base64'),
      data: encrypted.toString('base64'),
      tag: tag.toString('base64'),
    };

    return JSON.stringify(result);
  }

  /**
   * Encrypt with a versioned envelope. `keyId` defaults to the active key,
   * allowing callers to pin a key for wrapped per-evidence grants (#26).
   */
  async encryptVersioned(plain: string, keyId?: string): Promise<string> {
    if (!plain || typeof plain !== 'string') {
      throw new EncryptionError('Plain text must be non-empty string');
    }
    const key = keyId ? this.keyMap.get(keyId) : this.keys[0];
    if (!key) throw new EncryptionError('Unknown encryption key id');

    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
    const data = Buffer.concat([
      cipher.update(Buffer.from(plain, 'utf8')),
      cipher.final(),
    ]);
    const envelope: VersionedEncryptedData = {
      version: 2,
      keyId: keyId ?? this.getCurrentKeyId(),
      iv: iv.toString('base64'),
      data: data.toString('base64'),
      tag: cipher.getAuthTag().toString('base64'),
    };
    return JSON.stringify(envelope);
  }

  /**
   * Encrypt with a caller-supplied key using the same AES-256-GCM envelope.
   * Used for ephemeral per-evidence data keys (#26) without duplicating crypto.
   */
  encryptWithKey(plain: string, key: Buffer): string {
    if (!plain || typeof plain !== 'string') {
      throw new EncryptionError('Plain text must be non-empty string');
    }
    if (key.length !== 32) {
      throw new EncryptionError('Data key must be 32 bytes');
    }
    const iv = crypto.randomBytes(12);
    const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
    const data = Buffer.concat([
      cipher.update(Buffer.from(plain, 'utf8')),
      cipher.final(),
    ]);
    const envelope: EncryptedData = {
      iv: iv.toString('base64'),
      data: data.toString('base64'),
      tag: cipher.getAuthTag().toString('base64'),
    };
    return JSON.stringify(envelope);
  }

  /** Active key fingerprint, safe to persist alongside ciphertext. */
  getCurrentKeyId(): string {
    return this.keyFingerprint(this.keys[0]);
  }

  getKeyById(keyId: string): Buffer | undefined {
    return this.keyMap.get(keyId);
  }

  async decrypt(ciphertext: string): Promise<string> {
    if (!ciphertext || typeof ciphertext !== 'string') {
      throw new EncryptionError('Ciphertext must be non-empty string');
    }

    let parsed: EncryptedData & { version?: number; keyId?: string };
    try {
      parsed = JSON.parse(ciphertext) as typeof parsed;
    } catch {
      throw new DecryptionFailedError();
    }

    if (!parsed.iv || !parsed.data || !parsed.tag) {
      throw new DecryptionFailedError();
    }

    // #26 — new envelopes identify their key, so decrypt with exactly that
    // key instead of scanning the whole rotation list (O(n) -> O(1)).
    if (parsed.version === 2) {
      if (!parsed.keyId) throw new DecryptionFailedError();
      const key = this.keyMap.get(parsed.keyId);
      if (!key) throw new DecryptionFailedError();
      return this.decryptWithKey(parsed, key);
    }

    const iv = Buffer.from(parsed.iv, 'base64');
    const data = Buffer.from(parsed.data, 'base64');
    const tag = Buffer.from(parsed.tag, 'base64');

    // Try keys in rotation order (newest first)
    for (let i = 0; i < this.keys.length; i++) {
      try {
        const key = this.keys[i];
        const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
        decipher.setAuthTag(tag);

        const decrypted = Buffer.concat([
          decipher.update(data),
          decipher.final(),
        ]);

        return decrypted.toString('utf8');
      } catch (_err) {
        this.logger.debug(`Key ${i + 1} decrypt failed, trying next`);
        // Continue to next key
      }
    }

    throw new DecryptionFailedError();
  }

  /**
   * Rotate: Prepend new key to rotation list (new active key).
   * In production, persist to secure store (e.g. AWS SSM, Vault).
   */
  rotateKey(newKeyB64: string): void {
    const newKey = Buffer.from(newKeyB64, 'base64');
    if (newKey.length !== 32) {
      throw new EncryptionError('New key must be 32 bytes base64');
    }
    this.keys.unshift(newKey);
    this.rebuildKeyMap();
    this.logger.log(`Rotated: added new key, total ${this.keys.length}`);
  }

  decryptWithKey(envelope: EncryptedData, key: Buffer): string {
    const decipher = crypto.createDecipheriv(
      'aes-256-gcm',
      key,
      Buffer.from(envelope.iv, 'base64'),
    );
    decipher.setAuthTag(Buffer.from(envelope.tag, 'base64'));
    return Buffer.concat([
      decipher.update(Buffer.from(envelope.data, 'base64')),
      decipher.final(),
    ]).toString('utf8');
  }

  private rebuildKeyMap(): void {
    this.keyMap.clear();
    for (const key of this.keys) {
      this.keyMap.set(this.keyFingerprint(key), key);
    }
  }

  private keyFingerprint(key: Buffer): string {
    return crypto.createHash('sha256').update(key).digest('hex').slice(0, 16);
  }

  /**
   * Get current key count (for monitoring)
   */
  getKeyCount(): number {
    return this.keys.length;
  }
}
