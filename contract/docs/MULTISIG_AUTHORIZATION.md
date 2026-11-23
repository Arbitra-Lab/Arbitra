# Multi-Signature Authorization for Admin Functions

## Overview

Multi-signature authorization is a security best practice that requires multiple authorized signers to approve critical administrative actions. This document provides guidelines for implementing multi-signature (multisig) authorization in smart contracts.

## Security Benefits

- **Distributed Control**: Prevents single point of failure
- **Reduced Risk**: Requires consensus for critical operations
- **Accountability**: Creates audit trail of approvals
- **Fraud Prevention**: Harder to compromise multiple signers
- **Regulatory Compliance**: Meets institutional governance requirements

## Multisig Pattern Types

### 1. Threshold Signature Scheme (M-of-N)

```solidity
/// @dev M signers out of N total signers must approve
/// Example: 2-of-3 multisig requires 2 out of 3 signers

struct MultiSigConfig {
    address[] signers;        // All authorized signers
    uint256 threshold;        // Number of signatures required (M)
    uint256 nonce;           // Transaction counter to prevent replay
}

/// Benefits:
/// - 2-of-2: Maximum security for 2 parties
/// - 2-of-3: Good balance of security and flexibility
/// - 3-of-5: Suitable for larger groups
/// - M-of-N: Scales to any size group
```

### 2. Time-Locked Multisig

```solidity
struct TimeLockConfig {
    uint256 delay;              // Delay before execution (e.g., 48 hours)
    uint256 gracePeriod;        // Window for execution
    mapping(bytes32 => uint256) queuedTime;
}

/// Benefits:
/// - Emergency pause before execution
/// - Time for community review
/// - Prevent surprise changes
/// - Allow objections/governance override
```

### 3. Role-Based Multisig

```solidity
/// Different role combinations for different actions
enum SignerRole {
    ADMIN,      // General admin operations
    FINANCE,    // Financial operations
    SECURITY,   // Security-critical operations
    EMERGENCY   // Emergency pause/recovery
}

/// Examples:
/// - Transfer > $1M: requires 2 FINANCE + 1 ADMIN
/// - Security update: requires 2 SECURITY + 1 ADMIN
/// - Emergency pause: requires 1 EMERGENCY (immediate)
```

## Implementation Architecture

### Core Components

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import "@openzeppelin/contracts/utils/cryptography/EIP712.sol";

contract MultiSigAuthorization is EIP712 {
    using ECDSA for bytes32;

    // ============ State Variables ============
    
    address[] public signers;
    mapping(address => bool) public isSigner;
    uint256 public threshold;
    uint256 public nonce;
    
    // Queue for time-locked transactions
    mapping(bytes32 => TimeLockData) public timedTransactions;
    uint256 public constant TIMELOCK_DELAY = 2 days;
    uint256 public constant GRACE_PERIOD = 1 day;

    // ============ Structs ============

    struct TimeLockData {
        uint256 queuedTime;
        bool executed;
        bool cancelled;
    }

    struct MultiSigTransaction {
        address target;
        uint256 value;
        bytes data;
        string description;
        uint256 deadline;
    }

    // ============ Events ============

    event SignersUpdated(address[] newSigners, uint256 newThreshold);
    event TransactionQueued(bytes32 indexed txHash, uint256 queuedTime);
    event TransactionExecuted(bytes32 indexed txHash);
    event TransactionCancelled(bytes32 indexed txHash);

    // ============ Constructor ============

    constructor(
        address[] memory _signers,
        uint256 _threshold
    ) EIP712("MultiSigAuthorization", "1") {
        require(_signers.length > 0, "Must have at least 1 signer");
        require(_threshold > 0, "Threshold must be > 0");
        require(_threshold <= _signers.length, "Threshold too high");
        
        signers = _signers;
        threshold = _threshold;
        
        for (uint i = 0; i < _signers.length; i++) {
            require(_signers[i] != address(0), "Invalid signer");
            isSigner[_signers[i]] = true;
        }
    }

    // ============ Core Functions ============

    /// @dev Queue a transaction for execution (time-locked)
    function queueTransaction(
        MultiSigTransaction calldata tx,
        bytes[] calldata signatures
    ) external returns (bytes32) {
        // Verify signatures
        require(
            _verifySignatures(tx, signatures),
            "Invalid or insufficient signatures"
        );

        bytes32 txHash = keccak256(abi.encode(tx, nonce));
        require(!timedTransactions[txHash].executed, "Already executed");
        
        timedTransactions[txHash] = TimeLockData({
            queuedTime: block.timestamp,
            executed: false,
            cancelled: false
        });

        nonce++;
        emit TransactionQueued(txHash, block.timestamp);
        
        return txHash;
    }

    /// @dev Execute a time-locked transaction
    function executeTransaction(
        MultiSigTransaction calldata tx,
        bytes[] calldata signatures
    ) external payable {
        bytes32 txHash = keccak256(abi.encode(tx, nonce - 1));
        TimeLockData storage timedTx = timedTransactions[txHash];

        require(!timedTx.executed, "Already executed");
        require(!timedTx.cancelled, "Cancelled");
        require(
            block.timestamp >= timedTx.queuedTime + TIMELOCK_DELAY,
            "Still locked"
        );
        require(
            block.timestamp <= timedTx.queuedTime + TIMELOCK_DELAY + GRACE_PERIOD,
            "Grace period expired"
        );

        timedTx.executed = true;

        // Execute the transaction
        (bool success, ) = tx.target.call{value: tx.value}(tx.data);
        require(success, "Execution failed");

        emit TransactionExecuted(txHash);
    }

    /// @dev Cancel a queued transaction
    function cancelTransaction(bytes32 txHash) external {
        require(msg.sender == address(this), "Only through multisig");
        TimeLockData storage timedTx = timedTransactions[txHash];
        
        require(!timedTx.executed, "Already executed");
        timedTx.cancelled = true;
        
        emit TransactionCancelled(txHash);
    }

    // ============ Signature Verification ============

    /// @dev Verify that enough valid signatures are provided
    function _verifySignatures(
        MultiSigTransaction calldata tx,
        bytes[] calldata signatures
    ) internal view returns (bool) {
        require(signatures.length >= threshold, "Insufficient signatures");

        address[] memory recoverySigner = new address[](signatures.length);
        
        bytes32 digest = _hashTransaction(tx);

        for (uint256 i = 0; i < signatures.length; i++) {
            address signer = digest.recover(signatures[i]);
            
            // Check signer is authorized
            require(isSigner[signer], "Invalid signer");
            
            // Check no duplicates
            if (i > 0) {
                require(
                    recoverySigner[i - 1] != signer,
                    "Duplicate signature"
                );
            }
            
            recoverySigner[i] = signer;
        }

        return true;
    }

    /// @dev Generate EIP-712 hash for transaction
    function _hashTransaction(
        MultiSigTransaction calldata tx
    ) internal view returns (bytes32) {
        return _hashTypedDataV4(
            keccak256(
                abi.encode(
                    keccak256(
                        "MultiSigTransaction(address target,uint256 value,bytes data,string description,uint256 deadline)"
                    ),
                    tx.target,
                    tx.value,
                    keccak256(tx.data),
                    keccak256(bytes(tx.description)),
                    tx.deadline
                )
            )
        );
    }

    // ============ Signer Management ============

    /// @dev Update signers (requires multisig approval)
    function updateSigners(
        address[] calldata newSigners,
        uint256 newThreshold
    ) external {
        require(msg.sender == address(this), "Only through multisig");
        require(newSigners.length > 0, "Need at least 1 signer");
        require(newThreshold <= newSigners.length, "Invalid threshold");
        
        // Clear old signers
        for (uint i = 0; i < signers.length; i++) {
            isSigner[signers[i]] = false;
        }
        
        // Set new signers
        signers = newSigners;
        threshold = newThreshold;
        
        for (uint i = 0; i < newSigners.length; i++) {
            require(newSigners[i] != address(0), "Invalid signer");
            isSigner[newSigners[i]] = true;
        }
        
        emit SignersUpdated(newSigners, newThreshold);
    }

    // ============ View Functions ============

    function getSigners() external view returns (address[] memory) {
        return signers;
    }

    function getSignerCount() external view returns (uint256) {
        return signers.length;
    }

    function getThreshold() external view returns (uint256) {
        return threshold;
    }

    function hashTransaction(
        MultiSigTransaction calldata tx
    ) external view returns (bytes32) {
        return _hashTransaction(tx);
    }

    function isSignerValid(address signer) external view returns (bool) {
        return isSigner[signer];
    }

    function getTransactionStatus(bytes32 txHash) external view returns (
        bool queued,
        bool executed,
        bool cancelled,
        uint256 queuedTime
    ) {
        TimeLockData storage timedTx = timedTransactions[txHash];
        return (
            timedTx.queuedTime > 0,
            timedTx.executed,
            timedTx.cancelled,
            timedTx.queuedTime
        );
    }

    function canExecute(bytes32 txHash) external view returns (bool) {
        TimeLockData storage timedTx = timedTransactions[txHash];
        return (
            !timedTx.executed &&
            !timedTx.cancelled &&
            block.timestamp >= timedTx.queuedTime + TIMELOCK_DELAY &&
            block.timestamp <= timedTx.queuedTime + TIMELOCK_DELAY + GRACE_PERIOD
        );
    }
}
```

## Admin-Only Function Protection

### Pattern 1: Direct Multisig Check

```solidity
contract ProtectedAdminFunctions {
    MultiSigAuthorization public multisig;

    modifier onlyMultisig() {
        require(msg.sender == address(multisig), "Only multisig");
        _;
    }

    function criticalUpdate(bytes calldata data) external onlyMultisig {
        // Update logic
    }
}
```

### Pattern 2: Approve-Then-Execute

```solidity
contract ApprovalBased {
    struct PendingAction {
        bytes data;
        uint256 approvals;
        mapping(address => bool) approved;
        bool executed;
    }

    function approveAction(bytes32 actionId) external onlyMultisigMember {
        PendingAction storage action = pendingActions[actionId];
        require(!action.approved[msg.sender], "Already approved");
        
        action.approved[msg.sender] = true;
        action.approvals++;
        
        if (action.approvals >= threshold) {
            _executeAction(actionId);
        }
    }
}
```

### Pattern 3: Delegation Pattern

```solidity
contract DelegationPattern {
    MultiSigAuthorization public multisig;
    
    function delegatedCall(
        address target,
        bytes calldata data
    ) external returns (bytes memory) {
        // Verify call comes through multisig
        require(msg.sender == address(multisig), "Unauthorized");
        
        (bool success, bytes memory result) = target.call(data);
        require(success, "Call failed");
        return result;
    }
}
```

## Security Best Practices

### 1. Signature Validation

```solidity
/// ✓ Correct: Use EIP-712 for structured data
bytes32 digest = _hashTypedDataV4(structHash);
address signer = digest.recover(signature);

/// ✗ Avoid: Simple message hashing
bytes32 hash = keccak256(abi.encodePacked(data));
// Vulnerable to prefix attacks
```

### 2. Replay Protection

```solidity
/// ✓ Correct: Include nonce in signature
struct Transaction {
    uint256 nonce;        // Incremented each execution
    address target;
    bytes data;
}

/// ✓ Correct: Chain ID in EIP-712
address recoveredSigner = digest.recover(signature);

/// ✗ Avoid: No nonce protection
bytes32 hash = keccak256(abi.encode(target, data));
```

### 3. Duplicate Signature Prevention

```solidity
/// ✓ Correct: Track signers and prevent duplicates
address[] memory extractedSigners = new address[](signatures.length);

for (uint i = 0; i < signatures.length; i++) {
    address signer = _recoverSigner(signatures[i]);
    
    // Check no previous signer is higher than current
    if (i > 0) {
        require(
            uint160(extractedSigners[i-1]) < uint160(signer),
            "Duplicate signer"
        );
    }
}

/// ✗ Avoid: No duplicate checking
for (uint i = 0; i < signatures.length; i++) {
    _verifySingle(signatures[i]);
}
```

### 4. Time-Lock Security

```solidity
/// ✓ Correct: Enforce time lock with grace period
require(
    block.timestamp >= queuedTime + DELAY,
    "Still locked"
);
require(
    block.timestamp <= queuedTime + DELAY + GRACE_PERIOD,
    "Grace period expired"
);

/// ✗ Avoid: Immediate execution without time lock
// Allows no reaction time for community
```

## Testing Strategy

### Unit Tests

```typescript
describe('MultiSigAuthorization', () => {
  let multisig: MultiSigAuthorization;
  let signers: SignerWithAddress[];

  beforeEach(async () => {
    signers = await ethers.getSigners();
    const threshold = 2;
    multisig = await new MultiSigAuthorization__factory(signers[0])
      .deploy(
        [signers[0].address, signers[1].address, signers[2].address],
        threshold
      );
  });

  describe('queueTransaction', () => {
    it('queues transaction with valid signatures', async () => {
      const tx = {
        target: multisig.address,
        value: 0,
        data: '0x',
        description: 'Test',
        deadline: (await time.latest()) + 86400
      };

      const signatures = await Promise.all([
        signers[0]._signTypedData(
          await multisig.domain(),
          { MultiSigTransaction: [...] },
          tx
        ),
        signers[1]._signTypedData(
          await multisig.domain(),
          { MultiSigTransaction: [...] },
          tx
        )
      ]);

      await expect(multisig.queueTransaction(tx, signatures))
        .to.emit(multisig, 'TransactionQueued');
    });

    it('rejects with insufficient signatures', async () => {
      // Test with only 1 signature when 2 required
      await expect(multisig.queueTransaction(tx, [sig1]))
        .to.be.revertedWith('Insufficient signatures');
    });

    it('prevents duplicate signatures', async () => {
      // Test with same signature twice
      await expect(multisig.queueTransaction(tx, [sig1, sig1]))
        .to.be.revertedWith('Duplicate signature');
    });
  });

  describe('executeTransaction', () => {
    it('executes after time lock', async () => {
      // Queue transaction
      await multisig.queueTransaction(tx, signatures);
      
      // Wait for time lock
      await time.increase(TIMELOCK_DELAY);
      
      // Execute
      await expect(multisig.executeTransaction(tx, signatures))
        .to.emit(multisig, 'TransactionExecuted');
    });

    it('rejects execution before time lock', async () => {
      await multisig.queueTransaction(tx, signatures);
      
      await expect(multisig.executeTransaction(tx, signatures))
        .to.be.revertedWith('Still locked');
    });

    it('rejects execution after grace period', async () => {
      await multisig.queueTransaction(tx, signatures);
      
      // Wait beyond grace period
      await time.increase(TIMELOCK_DELAY + GRACE_PERIOD + 1);
      
      await expect(multisig.executeTransaction(tx, signatures))
        .to.be.revertedWith('Grace period expired');
    });
  });

  describe('Signer Management', () => {
    it('updates signers through multisig', async () => {
      const newSigners = [
        signers[3].address,
        signers[4].address,
        signers[5].address
      ];
      
      // Queue update
      await multisig.queueTransaction(
        {
          target: multisig.address,
          value: 0,
          data: multisig.interface.encodeFunctionData('updateSigners', [
            newSigners,
            2
          ]),
          description: 'Update signers',
          deadline: (await time.latest()) + 86400
        },
        signatures
      );
      
      // Execute after timelock
      await time.increase(TIMELOCK_DELAY);
      await multisig.executeTransaction(...);
      
      expect(await multisig.getSigners()).to.deep.equal(newSigners);
    });
  });
});
```

## Operational Guidelines

### Setup

1. Identify signers (usually 3-5 trusted parties)
2. Determine threshold (usually M-of-N where M = ⌈N/2⌉ + 1)
3. Deploy multisig contract
4. Configure protected functions

### Approval Process

1. Create transaction with multisig data
2. Each signer independently verifies transaction
3. Signers generate signatures (can be offline)
4. Queue transaction with collected signatures
5. Wait for time lock period
6. Execute transaction

### Emergency Procedures

- **Fast Emergency**: 1-of-N emergency signer for pause
- **Proposal Override**: Governance vote can cancel queued transaction
- **Key Rotation**: Update signers through multisig approval

## Related Documentation

- [EIP-712 Typed Structured Data Hashing](https://eips.ethereum.org/EIPS/eip-712)
- [OpenZeppelin MultiSig Implementation](https://github.com/OpenZeppelin/openzeppelin-contracts)
- [Safe Contracts Architecture](https://docs.safe.global/contracts)

## Future Enhancements

- [ ] Implement Social Recovery mechanism
- [ ] Add Hierarchical multisig (multisig of multisigs)
- [ ] Support Arbitrary message signing
- [ ] Add Web3 UX integration
- [ ] Implement Hardware wallet support
- [ ] Create Governance snapshot integration
