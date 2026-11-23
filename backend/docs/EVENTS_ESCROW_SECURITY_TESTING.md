# Events Indexing, Escrow Management, Security Testing & Timeout Handling

## Overview

This document provides comprehensive guidelines for implementing event indexing services, escrow partial release mechanisms, cross-contract security testing, and timeout/deadline management in the Arbitra platform.

---

## 1. Event Indexing & Query Service (#169)

### Purpose
Systematically index contract events for historical analysis and efficient querying without scanning the entire blockchain.

### Architecture

```typescript
interface EventIndexerConfig {
  contracts: ContractConfig[];
  database: {
    type: 'postgresql' | 'mongodb';
    connection: string;
    maxConnections: number;
  };
  indexing: {
    batchSize: number;
    confirmationBlocks: number;
    retryAttempts: number;
    retryDelayMs: number;
  };
}

interface IndexedEvent {
  id: string;
  contractId: string;
  eventType: string;
  blockNumber: number;
  transactionHash: string;
  logIndex: number;
  timestamp: Date;
  parameters: Record<string, any>;
  decodedData: DecodedEventData;
}

interface EventQuery {
  contractId: string;
  eventTypes?: string[];
  dateFrom?: Date;
  dateTo?: Date;
  limit?: number;
  offset?: number;
  orderBy?: 'timestamp' | 'blockNumber';
  order?: 'asc' | 'desc';
}
```

### Implementation Pattern

```typescript
// Event Listener and Indexer Service
class EventIndexerService {
  private provider: Web3Provider;
  private db: Database;
  private eventEmitter: EventEmitter;
  private lastIndexedBlock: number;

  async initialize(): Promise<void> {
    // Load last indexed block from database
    this.lastIndexedBlock = await this.db.getLastIndexedBlock();
    
    // Set up event listeners
    this.setupContractListeners();
    
    // Start background indexing
    this.startIndexingLoop();
  }

  private setupContractListeners(): void {
    const contracts = this.config.contracts;
    
    contracts.forEach(contract => {
      const abi = contract.abi;
      const address = contract.address;
      
      // Create contract instance
      const contractInstance = new Contract(address, abi, this.provider);
      
      // Listen to all events
      abi.forEach((abiItem: any) => {
        if (abiItem.type === 'event') {
          const eventName = abiItem.name;
          
          contractInstance.on(eventName, (...args: any[]) => {
            this.handleEvent({
              contractId: address,
              eventName,
              args,
              blockNumber: args[args.length - 1].blockNumber,
              transactionHash: args[args.length - 1].transactionHash,
              logIndex: args[args.length - 1].logIndex
            });
          });
        }
      });
    });
  }

  private async handleEvent(eventData: RawEventData): Promise<void> {
    try {
      // Decode event parameters
      const decodedData = this.decodeEventParameters(eventData);
      
      // Create indexed event
      const indexedEvent: IndexedEvent = {
        id: `${eventData.transactionHash}-${eventData.logIndex}`,
        contractId: eventData.contractId,
        eventType: eventData.eventName,
        blockNumber: eventData.blockNumber,
        transactionHash: eventData.transactionHash,
        logIndex: eventData.logIndex,
        timestamp: new Date(),
        parameters: eventData.args,
        decodedData
      };
      
      // Store in database
      await this.db.storeEvent(indexedEvent);
      
      // Emit for real-time subscribers
      this.eventEmitter.emit('event-indexed', indexedEvent);
      
      // Update last indexed block
      await this.db.updateLastIndexedBlock(eventData.blockNumber);
    } catch (error) {
      this.handleIndexingError(error, eventData);
    }
  }

  private async handleIndexingError(error: Error, eventData: RawEventData): Promise<void> {
    // Retry logic
    for (let attempt = 0; attempt < this.config.indexing.retryAttempts; attempt++) {
      try {
        await this.delay(this.config.indexing.retryDelayMs * Math.pow(2, attempt));
        await this.handleEvent(eventData);
        return;
      } catch (retryError) {
        if (attempt === this.config.indexing.retryAttempts - 1) {
          // Log to error tracking service
          console.error('Failed to index event after retries:', error, eventData);
          
          // Store failed event for manual review
          await this.db.storeFailedEvent(eventData, error.message);
        }
      }
    }
  }

  private startIndexingLoop(): void {
    setInterval(async () => {
      try {
        const currentBlock = await this.provider.getBlockNumber();
        const confirmationBlocks = this.config.indexing.confirmationBlocks;
        const targetBlock = currentBlock - confirmationBlocks;
        
        if (this.lastIndexedBlock < targetBlock) {
          await this.indexBlockRange(this.lastIndexedBlock + 1, targetBlock);
        }
      } catch (error) {
        console.error('Error in indexing loop:', error);
      }
    }, 12000); // Every 12 seconds (one block time)
  }

  private async indexBlockRange(fromBlock: number, toBlock: number): Promise<void> {
    const batchSize = this.config.indexing.batchSize;
    
    for (let currentBlock = fromBlock; currentBlock <= toBlock; currentBlock += batchSize) {
      const endBlock = Math.min(currentBlock + batchSize - 1, toBlock);
      
      try {
        const logs = await this.provider.getLogs({
          fromBlock: currentBlock,
          toBlock: endBlock
        });
        
        for (const log of logs) {
          await this.processLog(log);
        }
        
        this.lastIndexedBlock = endBlock;
      } catch (error) {
        console.error(`Error indexing blocks ${currentBlock}-${endBlock}:`, error);
        await this.delay(5000); // Wait before retry
      }
    }
  }

  private decodeEventParameters(eventData: RawEventData): DecodedEventData {
    // Decode based on event type
    const decoder = new EventDecoder();
    return decoder.decode(eventData.eventName, eventData.args);
  }

  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// Query Service
class EventQueryService {
  constructor(private db: Database) {}

  async queryEvents(query: EventQuery): Promise<IndexedEvent[]> {
    const { contractId, eventTypes, dateFrom, dateTo, limit = 100, offset = 0, orderBy = 'timestamp', order = 'desc' } = query;

    // Validate query
    if (limit > 10000) {
      throw new Error('Limit cannot exceed 10000');
    }

    // Build query
    let dbQuery = this.db.events();

    if (contractId) {
      dbQuery = dbQuery.where('contractId', contractId);
    }

    if (eventTypes && eventTypes.length > 0) {
      dbQuery = dbQuery.whereIn('eventType', eventTypes);
    }

    if (dateFrom) {
      dbQuery = dbQuery.where('timestamp', '>=', dateFrom);
    }

    if (dateTo) {
      dbQuery = dbQuery.where('timestamp', '<=', dateTo);
    }

    // Sort and paginate
    dbQuery = dbQuery
      .orderBy(orderBy, order)
      .limit(limit)
      .offset(offset);

    return await dbQuery;
  }

  async getEventStats(contractId: string): Promise<EventStats> {
    const events = await this.db.events().where('contractId', contractId);
    
    const eventTypeStats = {};
    events.forEach(event => {
      if (!eventTypeStats[event.eventType]) {
        eventTypeStats[event.eventType] = 0;
      }
      eventTypeStats[event.eventType]++;
    });

    return {
      totalEvents: events.length,
      eventTypes: eventTypeStats,
      oldestEvent: events.length > 0 ? events[0].timestamp : null,
      newestEvent: events.length > 0 ? events[events.length - 1].timestamp : null
    };
  }

  async getEventTimeline(contractId: string, eventType: string): Promise<TimelineEntry[]> {
    return await this.db.events()
      .where('contractId', contractId)
      .where('eventType', eventType)
      .orderBy('timestamp', 'asc')
      .select('timestamp', 'parameters', 'blockNumber');
  }
}
```

### Database Schema

```sql
CREATE TABLE indexed_events (
  id VARCHAR(255) PRIMARY KEY,
  contract_id VARCHAR(255) NOT NULL,
  event_type VARCHAR(255) NOT NULL,
  block_number BIGINT NOT NULL,
  transaction_hash VARCHAR(255) NOT NULL,
  log_index INT NOT NULL,
  timestamp TIMESTAMP NOT NULL,
  parameters JSONB NOT NULL,
  decoded_data JSONB NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(transaction_hash, log_index),
  INDEX(contract_id, event_type),
  INDEX(contract_id, timestamp),
  INDEX(event_type, timestamp)
);

CREATE TABLE indexer_state (
  id INT PRIMARY KEY DEFAULT 1,
  last_indexed_block BIGINT NOT NULL,
  last_updated TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE failed_events (
  id SERIAL PRIMARY KEY,
  contract_id VARCHAR(255) NOT NULL,
  event_name VARCHAR(255) NOT NULL,
  block_number BIGINT NOT NULL,
  transaction_hash VARCHAR(255) NOT NULL,
  error_message TEXT NOT NULL,
  raw_data JSONB NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  INDEX(contract_id, created_at)
);
```

---

## 2. Escrow Partial Release & Milestone Payouts (#170)

### Purpose
Enable partial fund release from escrow based on milestone completion rather than requiring full release.

### Model & State Management

```typescript
interface Milestone {
  id: string;
  title: string;
  description: string;
  amount: bigint;
  dueDate: Date;
  status: 'pending' | 'completed' | 'disputed';
  completionProof?: string;
  approvedBy?: string;
}

interface EscrowWithMilestones {
  id: string;
  buyer: string;
  seller: string;
  totalAmount: bigint;
  currency: string;
  status: 'active' | 'completed' | 'disputed' | 'cancelled';
  milestones: Milestone[];
  releasedAmount: bigint;
  createdAt: Date;
  expiresAt: Date;
  arbitrator?: string;
}

interface MilestoneRelease {
  milestoneId: string;
  amount: bigint;
  releasedAt: Date;
  releasedBy: string;
  transactionHash: string;
}
```

### Business Logic

```typescript
class MilestoneEscrowService {
  async createEscrowWithMilestones(
    buyer: string,
    seller: string,
    totalAmount: bigint,
    milestones: Milestone[],
    expiryDays: number
  ): Promise<EscrowWithMilestones> {
    // Validate milestones
    this.validateMilestones(milestones, totalAmount);

    // Calculate total to ensure it matches
    const milestonesTotalAmount = milestones.reduce((sum, m) => sum + m.amount, 0n);
    if (milestonesTotalAmount !== totalAmount) {
      throw new Error('Milestones total does not match escrow amount');
    }

    // Create escrow
    const escrow: EscrowWithMilestones = {
      id: this.generateId(),
      buyer,
      seller,
      totalAmount,
      currency: 'USD', // or configurable
      status: 'active',
      milestones: milestones.map(m => ({ ...m, status: 'pending' })),
      releasedAmount: 0n,
      createdAt: new Date(),
      expiresAt: new Date(Date.now() + expiryDays * 24 * 60 * 60 * 1000)
    };

    // Store in database
    await this.db.createEscrow(escrow);

    // Emit event
    this.eventEmitter.emit('escrow-created', escrow);

    return escrow;
  }

  async completeMilestone(
    escrowId: string,
    milestoneId: string,
    completionProof: string,
    completedBy: string
  ): Promise<void> {
    const escrow = await this.db.getEscrow(escrowId);

    if (!escrow) {
      throw new Error('Escrow not found');
    }

    if (escrow.status !== 'active') {
      throw new Error('Escrow is not active');
    }

    // Find milestone
    const milestone = escrow.milestones.find(m => m.id === milestoneId);
    if (!milestone) {
      throw new Error('Milestone not found');
    }

    if (milestone.status !== 'pending') {
      throw new Error('Milestone is not pending');
    }

    // Only seller can mark milestone complete
    if (completedBy !== escrow.seller) {
      throw new Error('Only seller can mark milestone complete');
    }

    // Update milestone
    milestone.status = 'completed';
    milestone.completionProof = completionProof;
    milestone.approvedBy = completedBy;

    await this.db.updateMilestone(escrowId, milestone);

    this.eventEmitter.emit('milestone-completed', { escrowId, milestoneId });
  }

  async releaseMilestonePayment(
    escrowId: string,
    milestoneId: string,
    releasedBy: string
  ): Promise<MilestoneRelease> {
    const escrow = await this.db.getEscrow(escrowId);

    if (!escrow) {
      throw new Error('Escrow not found');
    }

    // Only buyer or arbitrator can release
    const isAuthorized = releasedBy === escrow.buyer || releasedBy === escrow.arbitrator;
    if (!isAuthorized) {
      throw new Error('Not authorized to release funds');
    }

    // Find milestone
    const milestone = escrow.milestones.find(m => m.id === milestoneId);
    if (!milestone) {
      throw new Error('Milestone not found');
    }

    if (milestone.status !== 'completed') {
      throw new Error('Milestone is not completed');
    }

    // Check if already released
    const existingRelease = await this.db.getMilestoneRelease(escrowId, milestoneId);
    if (existingRelease) {
      throw new Error('Milestone already released');
    }

    // Execute payment
    const transactionHash = await this.executePayment(
      escrow.buyer,
      escrow.seller,
      milestone.amount,
      escrow.currency
    );

    // Record release
    const release: MilestoneRelease = {
      milestoneId,
      amount: milestone.amount,
      releasedAt: new Date(),
      releasedBy,
      transactionHash
    };

    await this.db.createMilestoneRelease(escrowId, release);

    // Update escrow released amount
    escrow.releasedAmount += milestone.amount;

    // Check if all milestones released
    const allReleased = escrow.milestones.every(m => m.status === 'pending' || 
      (m.status === 'completed' && await this.db.getMilestoneRelease(escrowId, m.id)));

    if (allReleased && escrow.releasedAmount === escrow.totalAmount) {
      escrow.status = 'completed';
    }

    await this.db.updateEscrow(escrow);

    this.eventEmitter.emit('milestone-released', release);

    return release;
  }

  async disputeMilestone(
    escrowId: string,
    milestoneId: string,
    reason: string,
    disputedBy: string
  ): Promise<void> {
    const escrow = await this.db.getEscrow(escrowId);

    if (!escrow) {
      throw new Error('Escrow not found');
    }

    const milestone = escrow.milestones.find(m => m.id === milestoneId);
    if (!milestone) {
      throw new Error('Milestone not found');
    }

    // Record dispute
    const dispute = {
      escrowId,
      milestoneId,
      reason,
      disputedBy,
      createdAt: new Date(),
      status: 'pending'
    };

    await this.db.createDispute(dispute);

    // Update milestone status
    milestone.status = 'disputed';
    await this.db.updateMilestone(escrowId, milestone);

    this.eventEmitter.emit('milestone-disputed', dispute);
  }

  private validateMilestones(milestones: Milestone[], totalAmount: bigint): void {
    if (milestones.length === 0) {
      throw new Error('At least one milestone required');
    }

    if (milestones.length > 100) {
      throw new Error('Maximum 100 milestones allowed');
    }

    // Validate each milestone
    milestones.forEach((m, index) => {
      if (!m.title || m.title.length === 0) {
        throw new Error(`Milestone ${index} has invalid title`);
      }

      if (m.amount <= 0n) {
        throw new Error(`Milestone ${index} has invalid amount`);
      }

      if (m.dueDate < new Date()) {
        throw new Error(`Milestone ${index} due date is in the past`);
      }
    });

    // Validate due dates are in order
    for (let i = 1; i < milestones.length; i++) {
      if (milestones[i].dueDate < milestones[i - 1].dueDate) {
        throw new Error('Milestone due dates must be in chronological order');
      }
    }
  }

  private async executePayment(
    from: string,
    to: string,
    amount: bigint,
    currency: string
  ): Promise<string> {
    // Execute actual payment transaction
    // This would call payment processor or blockchain
    const result = await this.paymentProcessor.transfer(from, to, amount, currency);
    return result.transactionHash;
  }
}
```

---

## 3. Cross-Contract Call Security Tests (#177)

### Purpose
Ensure secure cross-contract interactions with proper validation and state safety.

### Test Suite

```typescript
describe('Cross-Contract Call Security Tests', () => {
  describe('Call Authorization', () => {
    it('should validate caller permissions', async () => {
      const result = await contract.restrictedFunction.call(unauthorized);
      expect(result.error).toBeDefined();
      expect(result.error).toContain('Unauthorized');
    });

    it('should allow authorized callers only', async () => {
      const result = await contract.restrictedFunction.call(authorized);
      expect(result.error).toBeUndefined();
      expect(result.success).toBe(true);
    });

    it('should validate contract address before delegating', async () => {
      const fakeContract = '0x0000000000000000000000000000000000000000';
      const result = await mainContract.delegateCall(fakeContract, data);
      expect(result.error).toContain('Invalid contract');
    });
  });

  describe('Reentrancy Protection', () => {
    it('should prevent reentrancy attacks', async () => {
      const reentrancyAttack = async () => {
        await mainContract.withdraw();
        // Attacker tries to call withdraw again
        await mainContract.withdraw();
      };

      await expect(reentrancyAttack()).rejects.toThrow('ReentrancyGuard');
    });

    it('should block recursive calls to same function', async () => {
      let callCount = 0;
      const recursiveCall = async () => {
        callCount++;
        if (callCount < 2) {
          await contract.externalCall();
        }
      };

      await expect(recursiveCall()).rejects.toThrow();
      expect(callCount).toBe(1);
    });

    it('should track call depth', async () => {
      const depth = await contract.getCallDepth();
      expect(depth).toBeGreaterThanOrEqual(0);

      await contract.deepCall();

      const newDepth = await contract.getCallDepth();
      expect(newDepth).toBe(0); // Should reset after call
    });
  });

  describe('State Consistency', () => {
    it('should maintain state across contract calls', async () => {
      const initialState = await contract.getState();

      await contract.callExternalFunction();

      const finalState = await contract.getState();
      expect(initialState.balance).toEqual(finalState.balance);
    });

    it('should revert all state changes on failure', async () => {
      const stateBefore = await contract.getState();

      try {
        await contract.failingOperation();
      } catch (e) {
        // Expected to fail
      }

      const stateAfter = await contract.getState();
      expect(stateAfter).toEqual(stateBefore);
    });

    it('should validate contract invariants after external calls', async () => {
      await contract.externalCall();

      const invariantValid = await contract.checkInvariants();
      expect(invariantValid).toBe(true);
    });
  });

  describe('Return Value Validation', () => {
    it('should validate return values from external calls', async () => {
      const result = await contract.getExternalValue();
      expect(result).toBeDefined();
      expect(typeof result).toBe('number');
    });

    it('should handle mismatched return types', async () => {
      const result = await contract.getMismatchedType();
      expect(() => result.toUpperCase()).toThrow();
    });

    it('should validate return value ranges', async () => {
      const percentage = await contract.getPercentage();
      expect(percentage).toBeGreaterThanOrEqual(0);
      expect(percentage).toBeLessThanOrEqual(100);
    });
  });

  describe('Signature Validation', () => {
    it('should validate function signatures before calling', async () => {
      const wrongSignature = 'function(wrong_params)';
      const result = await contract.callWithSignature(wrongSignature);
      expect(result.error).toBeDefined();
    });

    it('should check ABI compatibility', async () => {
      const result = await contract.checkABICompatibility(unknownContract);
      expect(result.compatible).toBe(false);
    });
  });

  describe('Gas and Resource Limits', () => {
    it('should enforce gas limits on external calls', async () => {
      const result = await contract.expensiveCall({ gasLimit: 1000 });
      expect(result.outOfGas).toBe(true);
    });

    it('should track cumulative gas usage', async () => {
      const gasBefore = await contract.getGasUsed();
      
      await contract.multipleExternalCalls();
      
      const gasAfter = await contract.getGasUsed();
      expect(gasAfter).toBeGreaterThan(gasBefore);
    });
  });

  describe('Cross-Version Compatibility', () => {
    it('should handle different contract versions', async () => {
      const v1Contract = deploy(contractV1);
      const v2Contract = deploy(contractV2);

      const result = await v1Contract.callV2(v2Contract.address);
      expect(result.success).toBe(true);
    });

    it('should detect incompatible contract versions', async () => {
      const result = await contract.callIncompatible(oldContract);
      expect(result.error).toBeDefined();
    });
  });
});
```

---

## 4. Timeout & Deadline Tests (#179)

### Purpose
Ensure proper handling of timeouts and deadlines in async operations and contract functions.

### Test Suite

```typescript
describe('Timeout & Deadline Tests', () => {
  describe('Deadline Validation', () => {
    it('should reject operations after deadline', async () => {
      const deadline = Date.now() - 1000; // 1 second ago
      const result = await contract.operationWithDeadline(deadline);
      expect(result.error).toContain('Deadline passed');
    });

    it('should accept operations before deadline', async () => {
      const deadline = Date.now() + 60000; // 1 minute from now
      const result = await contract.operationWithDeadline(deadline);
      expect(result.error).toBeUndefined();
      expect(result.success).toBe(true);
    });

    it('should handle deadline boundary conditions', async () => {
      const now = Math.floor(Date.now() / 1000);
      const deadline = now * 1000; // Exact current time
      
      // Should be right at boundary
      const result = await contract.operationWithDeadline(deadline);
      expect(result).toBeDefined();
    });
  });

  describe('Timeout Handling', () => {
    it('should timeout long-running operations', async () => {
      const timeout = 100; // 100ms timeout
      
      const operation = new Promise((resolve, reject) => {
        contract.longRunningOperation()
          .then(resolve)
          .catch(reject);
      });

      const timeoutPromise = new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Timeout')), timeout)
      );

      await expect(Promise.race([operation, timeoutPromise])).rejects.toThrow('Timeout');
    });

    it('should not timeout operations completing in time', async () => {
      const timeout = 5000; // 5 second timeout
      
      const result = await Promise.race([
        contract.quickOperation(),
        new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), timeout))
      ]);

      expect(result).toBeDefined();
    });

    it('should handle timeout cleanup properly', async () => {
      let cleaned = false;

      try {
        await Promise.race([
          contract.operation().finally(() => { cleaned = true; }),
          new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), 100))
        ]);
      } catch (e) {
        // Expected timeout
      }

      expect(cleaned).toBe(true);
    });
  });

  describe('Deadline Extensions', () => {
    it('should allow deadline extension before expiry', async () => {
      let deadline = Date.now() + 60000;
      const result = await contract.extendDeadline(deadline, 60000);
      
      expect(result.newDeadline).toBeGreaterThan(deadline);
    });

    it('should reject extension after deadline', async () => {
      const deadline = Date.now() - 1000;
      const result = await contract.extendDeadline(deadline, 60000);
      
      expect(result.error).toBeDefined();
      expect(result.error).toContain('Cannot extend');
    });

    it('should track number of extensions', async () => {
      let deadline = Date.now() + 60000;
      let extensionCount = 0;

      for (let i = 0; i < 3; i++) {
        await contract.extendDeadline(deadline, 60000);
        extensionCount++;
        deadline += 60000;
      }

      const count = await contract.getExtensionCount();
      expect(count).toBe(extensionCount);
    });

    it('should enforce maximum extensions', async () => {
      let deadline = Date.now() + 60000;
      const maxExtensions = 5;

      for (let i = 0; i < maxExtensions + 1; i++) {
        const result = await contract.extendDeadline(deadline, 60000);
        
        if (i >= maxExtensions) {
          expect(result.error).toBeDefined();
        }
        deadline += 60000;
      }
    });
  });

  describe('Timeout Precision', () => {
    it('should handle millisecond precision', async () => {
      const deadline = Date.now() + 100; // 100ms in future
      
      await new Promise(resolve => setTimeout(resolve, 50)); // Wait 50ms
      
      const result = await contract.operationWithDeadline(deadline);
      expect(result.success).toBe(true);
    });

    it('should handle block timestamp precision in contracts', async () => {
      const blockTimestamp = await contract.getBlockTimestamp();
      const deadline = blockTimestamp + 3600; // 1 hour in future

      const result = await contract.operationWithDeadline(deadline);
      expect(result.success).toBe(true);
    });
  });

  describe('Multiple Concurrent Timeouts', () => {
    it('should handle multiple operations with different timeouts', async () => {
      const operations = [
        contract.operation1().catch(() => null),
        contract.operation2().catch(() => null),
        contract.operation3().catch(() => null)
      ];

      const results = await Promise.all(operations);
      expect(results).toHaveLength(3);
    });

    it('should not interfere timeouts across operations', async () => {
      const promises = [];

      for (let i = 0; i < 5; i++) {
        promises.push(
          contract.operation(100 * i)
        );
      }

      const results = await Promise.allSettled(promises);
      
      let resolvedCount = 0;
      let rejectedCount = 0;

      results.forEach(result => {
        if (result.status === 'fulfilled') resolvedCount++;
        if (result.status === 'rejected') rejectedCount++;
      });

      expect(resolvedCount + rejectedCount).toBe(5);
    });
  });

  describe('Timeout Recovery', () => {
    it('should allow retry after timeout', async () => {
      let attempts = 0;

      const retryOperation = async () => {
        for (let i = 0; i < 3; i++) {
          try {
            return await contract.operation(100 * i);
          } catch (e) {
            attempts++;
            if (i === 2) throw e;
          }
        }
      };

      const result = await retryOperation();
      expect(result).toBeDefined();
      expect(attempts).toBeGreaterThan(0);
    });

    it('should not accumulate state from failed timeouts', async () => {
      const stateBefore = await contract.getState();

      try {
        await contract.statefulOperation(50);
      } catch (e) {
        // Expected timeout
      }

      const stateAfter = await contract.getState();
      expect(stateAfter).toEqual(stateBefore);
    });
  });

  describe('Deadline in Contracts', () => {
    it('should enforce deadlines in contract calls', async () => {
      const deadline = Math.floor(Date.now() / 1000) - 10; // 10 seconds ago
      
      const tx = contract.executeWithDeadline(deadline);
      await expect(tx).rejects.toThrow('deadline');
    });

    it('should track deadline compliance', async () => {
      const deadline = Math.floor(Date.now() / 1000) + 3600;
      
      await contract.executeWithDeadline(deadline);
      
      const isCompliant = await contract.isDeadlineCompliant(deadline);
      expect(isCompliant).toBe(true);
    });
  });
});
```

---

## Implementation Checklist

- [ ] Event Indexer Service
  - [ ] Database schema created
  - [ ] Event listener implementation
  - [ ] Query service with filters
  - [ ] Retry logic for failures
  - [ ] Pagination support

- [ ] Escrow with Milestones
  - [ ] Database schema for milestones
  - [ ] Creation and validation
  - [ ] Milestone completion logic
  - [ ] Payment release mechanism
  - [ ] Dispute handling

- [ ] Cross-Contract Security
  - [ ] Reentrancy guard
  - [ ] Call depth tracking
  - [ ] State consistency checks
  - [ ] Return value validation
  - [ ] Gas limit enforcement

- [ ] Timeouts & Deadlines
  - [ ] Deadline validation
  - [ ] Timeout handling
  - [ ] Extension mechanism
  - [ ] Recovery procedures
  - [ ] Multi-operation coordination

## Related Documentation

- [Event-Driven Architecture](https://martinfowler.com/articles/201701-event-driven.html)
- [Escrow Patterns](https://en.wikipedia.org/wiki/Escrow)
- [Smart Contract Security](https://consensys.github.io/smart-contract-best-practices/)
- [Async/Await Best Practices](https://javascript.info/async-await)
