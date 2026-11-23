# Weighted Voting, Storage Compression, Immutability Verification & Rate Limiting Guide

## Overview

This document provides comprehensive implementation guidelines for four critical features: weighted voting for dispute resolution, contract storage compression, immutability verification, and rate limiting on authentication endpoints.

---

## 1. Weighted Voting for Dispute Resolution (#173)

### Purpose
Implement a democratic dispute resolution system where voter influence is weighted based on reputation, stake, or prior involvement.

### Model

```typescript
interface VoterProfile {
  address: string;
  reputation: number; // 0-100 scale
  stakingAmount: bigint;
  participationCount: number;
  successRate: number; // % of correct votes
}

interface Vote {
  voterId: string;
  disputeId: string;
  choice: 'for' | 'against' | 'abstain';
  weight: number; // Calculated based on voter profile
  timestamp: Date;
  reasoning?: string;
}

interface Dispute {
  id: string;
  title: string;
  description: string;
  status: 'open' | 'voting' | 'resolved' | 'appealed';
  createdAt: Date;
  votingDeadline: Date;
  votes: Vote[];
  weightedResult: WeightedVotingResult;
  resolution?: DisputeResolution;
}

interface WeightedVotingResult {
  totalWeightFor: number;
  totalWeightAgainst: number;
  totalWeight: number;
  consensusThreshold: number; // e.g., 66%
  finalResult: 'for' | 'against' | 'inconclusive';
  confidence: number; // 0-1 scale
}

interface DisputeResolution {
  resolvedBy: string;
  resolution: string;
  implementedAt: Date;
  appealDeadline?: Date;
}
```

### Weight Calculation Strategy

```typescript
class WeightedVotingEngine {
  calculateVoterWeight(voterProfile: VoterProfile): number {
    const reputationWeight = 0.4;
    const stakingWeight = 0.3;
    const participationWeight = 0.2;
    const successWeight = 0.1;

    const normalizedReputation = voterProfile.reputation / 100;
    const normalizedStaking = Math.min(voterProfile.stakingAmount / MAX_STAKE, 1);
    const normalizedParticipation = Math.min(voterProfile.participationCount / 100, 1);
    const normalizedSuccess = voterProfile.successRate / 100;

    const totalWeight =
      normalizedReputation * reputationWeight +
      normalizedStaking * stakingWeight +
      normalizedParticipation * participationWeight +
      normalizedSuccess * successWeight;

    return totalWeight * MAX_WEIGHT; // e.g., 100
  }

  async recordVote(vote: Vote): Promise<void> {
    // Validate vote
    this.validateVote(vote);

    // Calculate weight based on voter profile
    const voterProfile = await this.getVoterProfile(vote.voterId);
    vote.weight = this.calculateVoterWeight(voterProfile);

    // Store vote
    await this.db.storeVote(vote);

    // Update dispute results in real-time
    await this.updateDisputeResults(vote.disputeId);

    // Track voting patterns for future reputation updates
    await this.recordVotingPattern(vote);
  }

  async getDisputeResult(disputeId: string): Promise<WeightedVotingResult> {
    const dispute = await this.db.getDispute(disputeId);
    const votes = dispute.votes;

    let totalWeightFor = 0;
    let totalWeightAgainst = 0;
    let totalWeight = 0;

    votes.forEach(vote => {
      if (vote.choice === 'for') {
        totalWeightFor += vote.weight;
      } else if (vote.choice === 'against') {
        totalWeightAgainst += vote.weight;
      }
      totalWeight += vote.weight;
    });

    const consensusThreshold = 0.66; // 66% majority
    const percentageFor = totalWeightFor / totalWeight;
    const percentageAgainst = totalWeightAgainst / totalWeight;

    let finalResult: 'for' | 'against' | 'inconclusive' = 'inconclusive';
    if (percentageFor >= consensusThreshold) {
      finalResult = 'for';
    } else if (percentageAgainst >= consensusThreshold) {
      finalResult = 'against';
    }

    return {
      totalWeightFor,
      totalWeightAgainst,
      totalWeight,
      consensusThreshold,
      finalResult,
      confidence: Math.max(percentageFor, percentageAgainst)
    };
  }

  async updateVoterReputation(voterId: string, outcome: 'correct' | 'incorrect'): Promise<void> {
    const voterProfile = await this.db.getVoterProfile(voterId);

    // Adjust reputation based on voting outcome
    const reputationAdjustment = outcome === 'correct' ? 1 : -1;
    voterProfile.reputation = Math.max(0, Math.min(100, voterProfile.reputation + reputationAdjustment));

    // Update success rate
    const totalVotes = voterProfile.participationCount;
    const correctVotes = outcome === 'correct' ? totalVotes + 1 : totalVotes;
    voterProfile.successRate = (correctVotes / (voterProfile.participationCount + 1)) * 100;

    // Increment participation count
    voterProfile.participationCount++;

    await this.db.updateVoterProfile(voterProfile);
  }

  private validateVote(vote: Vote): void {
    if (!['for', 'against', 'abstain'].includes(vote.choice)) {
      throw new Error('Invalid vote choice');
    }

    if (!vote.voterId || !vote.disputeId) {
      throw new Error('Missing required fields');
    }
  }
}
```

---

## 2. Contract Storage Compression (#174)

### Purpose
Reduce on-chain storage costs by efficiently packing data structures and implementing compression techniques.

### Compression Strategies

```typescript
// Strategy 1: Struct Packing
interface CompressedData {
  // Instead of separate uint256 fields
  packed32Bytes: string; // Contains multiple values
  packed16Bytes: string;
}

// Pack multiple values into single storage slot
class StorageCompressor {
  packValues(
    value1: bigint, // 0-255
    value2: bigint, // 0-65535
    value3: bigint  // 0-16777215
  ): string {
    // Fit into single 256-bit slot
    const packed = (value3 << 24n) | (value2 << 16n) | value1;
    return '0x' + packed.toString(16).padStart(64, '0');
  }

  unpackValues(packed: string): [bigint, bigint, bigint] {
    const value = BigInt(packed);
    const value1 = value & 0xFFn;
    const value2 = (value >> 16n) & 0xFFFFn;
    const value3 = (value >> 24n) & 0xFFFFFFn;
    return [value1, value2, value3];
  }

  // Strategy 2: Mapping vs Array optimization
  // Use mappings with composite keys instead of arrays
  getStorageKey(contractId: string, index: number): string {
    return keccak256(abi.encode(['bytes32', 'uint256'], [contractId, index]));
  }

  // Strategy 3: Data archiving
  archiveOldData(contractId: string, beforeDate: Date): Promise<void> {
    // Move historical data to external storage (IPFS)
    // Keep only recent data on-chain
    // Store IPFS hash on-chain for retrieval
  }

  // Strategy 4: Bitfield encoding
  encodePermissions(read: boolean, write: boolean, delete_: boolean, admin: boolean): number {
    return (
      (read ? 1 : 0) |
      (write ? 1 : 0) << 1 |
      (delete_ ? 1 : 0) << 2 |
      (admin ? 1 : 0) << 3
    );
  }

  decodePermissions(encoded: number): {
    read: boolean;
    write: boolean;
    delete: boolean;
    admin: boolean;
  } {
    return {
      read: (encoded & 1) !== 0,
      write: (encoded & 2) !== 0,
      delete: (encoded & 4) !== 0,
      admin: (encoded & 8) !== 0
    };
  }
}

// Solidity Example
interface CompressedContract {
  /*
  pragma solidity ^0.8.0;

  contract CompressedStorage {
    // Store 4 uint64 values in 1 slot instead of 4
    mapping(uint256 => uint256) packedData;

    function packFourUint64(
      uint64 a, uint64 b, uint64 c, uint64 d
    ) public pure returns (uint256) {
      return (uint256(a) | (uint256(b) << 64) | 
              (uint256(c) << 128) | (uint256(d) << 192));
    }

    function unpackFourUint64(uint256 packed) public pure 
      returns (uint64, uint64, uint64, uint64) {
      return (
        uint64(packed),
        uint64(packed >> 64),
        uint64(packed >> 128),
        uint64(packed >> 192)
      );
    }

    // Saves 75% storage
  }
  */
}
```

### Storage Optimization Guidelines

```typescript
interface StorageOptimizationGuidelines {
  // ✓ Good: Group related small values
  // struct UserData {
  //   address user;        // 20 bytes
  //   uint32 joinDate;     // 4 bytes (slot 1)
  //   uint16 reputation;   // 2 bytes (slot 1)
  //   bool verified;       // 1 byte (slot 1)
  //   // Total: 27 bytes in 1 slot
  // }

  // ✗ Bad: Waste storage with separate slots
  // struct UserData {
  //   address user;        // 20 bytes (slot 1)
  //   uint256 joinDate;    // 32 bytes (slot 2) - wastes 28 bytes
  //   uint256 reputation;  // 32 bytes (slot 3) - wastes 30 bytes
  // }

  // Cost comparison
  costGood: '1 SSTORE operation'; // ~20,000 gas
  costBad: '3 SSTORE operations'; // ~60,000 gas
  savings: '66% reduction'; // With proper packing
}
```

---

## 3. Contract Immutability Verification (#178)

### Purpose
Verify that critical contract code cannot be modified, ensuring trust and security.

### Verification Methods

```typescript
class ImmutabilityVerifier {
  /**
   * Verify that contract bytecode is immutable
   */
  async verifyImmutability(contractAddress: string): Promise<ImmutabilityReport> {
    // 1. Check if contract is verified on block explorer
    const isVerified = await this.checkCodeVerification(contractAddress);

    // 2. Get bytecode and calculate hash
    const bytecode = await this.provider.getCode(contractAddress);
    const bytecodeHash = keccak256(bytecode);

    // 3. Check storage for proxy patterns
    const isProxy = await this.detectProxyPattern(contractAddress);

    // 4. Verify initialization
    const hasInitializer = this.checkInitializerLocks(bytecode);

    // 5. Check for self-destruct
    const hasSelfDestruct = this.checkSelfDestructCode(bytecode);

    // 6. Verify owner/admin is renounced or multi-sig
    const ownerStatus = await this.checkOwnershipStatus(contractAddress);

    return {
      contractAddress,
      bytecodeHash,
      isVerified,
      isProxy,
      hasInitializer,
      hasSelfDestruct,
      ownerStatus,
      immutable: !isProxy && hasInitializer && !hasSelfDestruct && ownerStatus.isRenounced,
      report: this.generateReport({
        isVerified,
        isProxy,
        hasInitializer,
        hasSelfDestruct,
        ownerStatus
      })
    };
  }

  private async checkCodeVerification(contractAddress: string): Promise<boolean> {
    // Check Etherscan/block explorer for verified source code
    const response = await fetch(
      `https://api.etherscan.io/api?module=contract&action=getsourcecode&address=${contractAddress}`
    );
    const data = await response.json();
    return data.result[0].SourceCode !== '';
  }

  private async detectProxyPattern(contractAddress: string): Promise<boolean> {
    // Check for common proxy patterns (EIP-1967, etc.)
    const IMPLEMENTATION_SLOT = '0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d4fb53c';

    try {
      const implementation = await this.provider.getStorageAt(contractAddress, IMPLEMENTATION_SLOT);
      return implementation !== '0x0000000000000000000000000000000000000000';
    } catch (e) {
      return false;
    }
  }

  private checkInitializerLocks(bytecode: string): boolean {
    // Check if contract has initializer lock mechanism
    // Look for OpenZeppelin Initializable pattern
    return bytecode.includes('0x33') || bytecode.includes('initialized');
  }

  private checkSelfDestructCode(bytecode: string): boolean {
    // Check for SELFDESTRUCT (0xff) opcode
    return bytecode.includes('ff');
  }

  private async checkOwnershipStatus(contractAddress: string): Promise<OwnershipStatus> {
    try {
      const contract = new ethers.Contract(
        contractAddress,
        ['function owner() public view returns (address)'],
        this.provider
      );

      const owner = await contract.owner();

      return {
        hasOwner: owner !== ethers.ZeroAddress,
        owner,
        isRenounced: owner === ethers.ZeroAddress,
        isMultiSig: await this.isMultiSigWallet(owner)
      };
    } catch (e) {
      return {
        hasOwner: false,
        owner: null,
        isRenounced: true,
        isMultiSig: false
      };
    }
  }

  private async isMultiSigWallet(address: string): Promise<boolean> {
    // Check if address is a known multi-sig wallet (Gnosis Safe, etc.)
    const knownMultiSigs = [
      '0x...' // Gnosis Safe addresses
    ];
    return knownMultiSigs.includes(address);
  }

  private generateReport(findings: any): string {
    let report = 'Contract Immutability Report\n';
    report += '=============================\n\n';

    report += `✓ Code Verification: ${findings.isVerified ? 'PASSED' : 'FAILED'}\n`;
    report += `✓ Proxy Pattern: ${findings.isProxy ? 'DETECTED (Upgradeable)' : 'NOT FOUND (Static)'}\n`;
    report += `✓ Initializer Lock: ${findings.hasInitializer ? 'PRESENT' : 'MISSING'}\n`;
    report += `✓ Self-Destruct: ${findings.hasSelfDestruct ? 'DETECTED (Risk)' : 'NOT FOUND'}\n`;
    report += `✓ Ownership: ${findings.ownerStatus.isRenounced ? 'RENOUNCED (Immutable)' : 'ACTIVE'}\n`;

    report += '\nSummary:\n';
    if (!findings.isProxy && findings.hasInitializer && !findings.hasSelfDestruct && findings.ownerStatus.isRenounced) {
      report += 'Contract is IMMUTABLE and TRUSTWORTHY';
    } else {
      report += 'Contract has modifiability or risks';
    }

    return report;
  }
}

interface ImmutabilityReport {
  contractAddress: string;
  bytecodeHash: string;
  isVerified: boolean;
  isProxy: boolean;
  hasInitializer: boolean;
  hasSelfDestruct: boolean;
  ownerStatus: OwnershipStatus;
  immutable: boolean;
  report: string;
}

interface OwnershipStatus {
  hasOwner: boolean;
  owner: string | null;
  isRenounced: boolean;
  isMultiSig: boolean;
}
```

---

## 4. Rate Limiting on Auth Endpoints (#181)

### Purpose
Protect authentication endpoints from brute force and denial-of-service attacks.

### Implementation

```typescript
interface RateLimitConfig {
  windowMs: number; // Time window in ms
  maxRequests: number; // Max requests per window
  keyGenerator: (req: Request) => string;
  skipSuccessfulRequests?: boolean;
  skipFailedRequests?: boolean;
}

interface RateLimitStore {
  increment(key: string): Promise<number>;
  reset(key: string): Promise<void>;
  get(key: string): Promise<number>;
}

// In-Memory Store
class InMemoryRateLimitStore implements RateLimitStore {
  private store: Map<string, { count: number; resetTime: number }> = new Map();

  async increment(key: string): Promise<number> {
    const now = Date.now();
    const entry = this.store.get(key);

    if (!entry || entry.resetTime < now) {
      // New window
      this.store.set(key, { count: 1, resetTime: now + CONFIG.windowMs });
      return 1;
    }

    entry.count++;
    return entry.count;
  }

  async reset(key: string): Promise<void> {
    this.store.delete(key);
  }

  async get(key: string): Promise<number> {
    const entry = this.store.get(key);
    return entry?.count || 0;
  }
}

// Redis Store (for distributed systems)
class RedisRateLimitStore implements RateLimitStore {
  constructor(private redis: Redis) {}

  async increment(key: string): Promise<number> {
    const count = await this.redis.incr(key);
    if (count === 1) {
      await this.redis.expire(key, Math.ceil(CONFIG.windowMs / 1000));
    }
    return count;
  }

  async reset(key: string): Promise<void> {
    await this.redis.del(key);
  }

  async get(key: string): Promise<number> {
    const count = await this.redis.get(key);
    return count ? parseInt(count) : 0;
  }
}

// Rate Limiter Middleware
class AuthRateLimiter {
  private store: RateLimitStore;
  private config: RateLimitConfig;

  constructor(config: RateLimitConfig) {
    this.config = config;
    this.store = new InMemoryRateLimitStore();
  }

  middleware() {
    return async (req: Request, res: Response, next: NextFunction) => {
      const key = this.config.keyGenerator(req);
      const currentCount = await this.store.increment(key);

      // Set headers
      res.set('RateLimit-Limit', String(this.config.maxRequests));
      res.set('RateLimit-Remaining', String(Math.max(0, this.config.maxRequests - currentCount)));

      if (currentCount > this.config.maxRequests) {
        return res.status(429).json({
          error: 'Too many requests',
          retryAfter: this.config.windowMs / 1000
        });
      }

      next();
    };
  }
}

// Auth Endpoints Configuration
const authRateLimiters = {
  login: new AuthRateLimiter({
    windowMs: 15 * 60 * 1000, // 15 minutes
    maxRequests: 5, // 5 attempts
    keyGenerator: (req: Request) => `login:${req.ip}`,
    skipSuccessfulRequests: true // Don't count successful logins
  }),

  register: new AuthRateLimiter({
    windowMs: 60 * 60 * 1000, // 1 hour
    maxRequests: 3, // 3 registrations per hour
    keyGenerator: (req: Request) => `register:${req.body.email}`
  }),

  passwordReset: new AuthRateLimiter({
    windowMs: 60 * 60 * 1000, // 1 hour
    maxRequests: 3,
    keyGenerator: (req: Request) => `reset:${req.body.email}`
  }),

  verificationCode: new AuthRateLimiter({
    windowMs: 10 * 60 * 1000, // 10 minutes
    maxRequests: 5,
    keyGenerator: (req: Request) => `verify:${req.ip}`
  })
};

// Usage in Express
app.post('/auth/login', authRateLimiters.login.middleware(), loginHandler);
app.post('/auth/register', authRateLimiters.register.middleware(), registerHandler);
app.post('/auth/password-reset', authRateLimiters.passwordReset.middleware(), resetHandler);
app.post('/auth/verify-code', authRateLimiters.verificationCode.middleware(), verifyHandler);

// Advanced: Distributed Rate Limiting
class DistributedRateLimiter {
  async isRateLimited(key: string, limit: number): Promise<boolean> {
    // Use Redis with Lua script for atomic operations
    const script = `
      local current = redis.call('incr', KEYS[1])
      if current == 1 then
        redis.call('expire', KEYS[1], ARGV[1])
      end
      return current
    `;

    const count = await this.redis.eval(
      script,
      1,
      key,
      Math.ceil(this.config.windowMs / 1000)
    );

    return count > limit;
  }

  async getStats(key: string): Promise<RateLimitStats> {
    const count = await this.store.get(key);
    const ttl = await this.redis.ttl(key);

    return {
      count,
      limit: this.config.maxRequests,
      remaining: Math.max(0, this.config.maxRequests - count),
      resetTime: Date.now() + (ttl * 1000)
    };
  }
}

interface RateLimitStats {
  count: number;
  limit: number;
  remaining: number;
  resetTime: number;
}
```

### Monitoring & Analytics

```typescript
class RateLimitMonitor {
  async trackBlockedRequest(key: string, endpoint: string): Promise<void> {
    await this.db.createLog({
      timestamp: new Date(),
      endpoint,
      key,
      type: 'rate_limit_exceeded'
    });

    // Alert if too many blocks from same IP
    const recentBlocks = await this.db.countRecentBlocks(key, 1 * 60 * 1000);
    if (recentBlocks > 20) {
      await this.alertSuspiciousActivity(key);
    }
  }

  async getAnalytics(timeRange: 'hour' | 'day' | 'week'): Promise<RateLimitAnalytics> {
    const logs = await this.db.getLogs(timeRange);

    return {
      totalBlocked: logs.length,
      blockedByEndpoint: this.groupBy(logs, 'endpoint'),
      topBlockedIPs: this.getTopIPs(logs, 10),
      trends: this.calculateTrends(logs)
    };
  }
}

interface RateLimitAnalytics {
  totalBlocked: number;
  blockedByEndpoint: Record<string, number>;
  topBlockedIPs: Array<{ ip: string; count: number }>;
  trends: Array<{ timestamp: Date; count: number }>;
}
```

---

## Implementation Checklist

- [ ] Weighted Voting
  - [ ] Voter profile system
  - [ ] Weight calculation engine
  - [ ] Dispute creation and voting
  - [ ] Result aggregation
  - [ ] Reputation updates

- [ ] Storage Compression
  - [ ] Identify compression opportunities
  - [ ] Implement packing strategies
  - [ ] Update contracts with optimizations
  - [ ] Measure gas savings
  - [ ] Document patterns

- [ ] Immutability Verification
  - [ ] Code verification checks
  - [ ] Proxy pattern detection
  - [ ] Ownership status check
  - [ ] Generate reports
  - [ ] Create verification service

- [ ] Rate Limiting
  - [ ] In-memory store implementation
  - [ ] Redis store for distributed systems
  - [ ] Middleware creation
  - [ ] Endpoint configuration
  - [ ] Monitoring and alerts

## Related Documentation

- [Weighted Voting Systems](https://en.wikipedia.org/wiki/Quadratic_voting)
- [Storage Layout in Solidity](https://docs.soliditylang.org/en/latest/internals/layout_in_storage.html)
- [Contract Verification Standards](https://docs.etherscan.io/tutorials/hardhat-verification)
- [OWASP Rate Limiting](https://cheatsheetseries.owasp.org/cheatsheets/Authentication_Cheat_Sheet.html)
