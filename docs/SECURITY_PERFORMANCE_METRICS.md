# Security & Performance Metrics Guide

## Overview

This document provides comprehensive implementation guidelines for four critical features: gas usage & performance metrics, CSRF protection, Content Security Policy headers, and environment variable encryption.

---

## 1. Gas Usage & Performance Metrics (#180)

### Purpose
Track and monitor gas consumption and performance metrics for smart contract operations.

### Model & Architecture

```typescript
interface GasMetric {
  id: string;
  contractAddress: string;
  functionName: string;
  gasUsed: bigint;
  gasPrice: bigint;
  transactionHash: string;
  blockNumber: number;
  timestamp: Date;
  status: 'success' | 'reverted';
  error?: string;
}

interface PerformanceMetric {
  id: string;
  operationName: string;
  executionTimeMs: number;
  memoryUsedBytes: number;
  cpuUsagePercent: number;
  timestamp: Date;
}

interface GasAnalytics {
  totalGasUsed: bigint;
  averageGasPerTransaction: bigint;
  medianGasPerTransaction: bigint;
  minGasPerTransaction: bigint;
  maxGasPerTransaction: bigint;
  gasOptimizationPotential: number; // percentage
  costInUSD: number;
}
```

### Implementation

```typescript
class GasMetricsCollector {
  private metrics: GasMetric[] = [];
  private performanceMetrics: PerformanceMetric[] = [];

  async trackTransaction(
    tx: Transaction,
    receipt: TransactionReceipt,
    functionName: string
  ): Promise<void> {
    const metric: GasMetric = {
      id: `${receipt.transactionHash}-${Date.now()}`,
      contractAddress: receipt.to || '',
      functionName,
      gasUsed: receipt.gasUsed,
      gasPrice: tx.gasPrice || 0n,
      transactionHash: receipt.transactionHash,
      blockNumber: receipt.blockNumber,
      timestamp: new Date(),
      status: receipt.status === 1 ? 'success' : 'reverted',
      error: receipt.status === 0 ? 'Transaction reverted' : undefined
    };

    await this.storeMetric(metric);
    this.metrics.push(metric);

    // Emit event for real-time monitoring
    this.eventEmitter.emit('gas-metric-recorded', metric);
  }

  async trackFunctionPerformance<T>(
    functionName: string,
    fn: () => Promise<T>
  ): Promise<T> {
    const startTime = performance.now();
    const startMemory = process.memoryUsage().heapUsed;

    try {
      const result = await fn();
      
      const endTime = performance.now();
      const endMemory = process.memoryUsage().heapUsed;

      const metric: PerformanceMetric = {
        id: `${functionName}-${Date.now()}`,
        operationName: functionName,
        executionTimeMs: endTime - startTime,
        memoryUsedBytes: endMemory - startMemory,
        cpuUsagePercent: this.estimateCPUUsage(),
        timestamp: new Date()
      };

      await this.storePerformanceMetric(metric);
      this.performanceMetrics.push(metric);

      return result;
    } catch (error) {
      throw error;
    }
  }

  async getGasAnalytics(
    timeRange: 'hour' | 'day' | 'week' | 'month'
  ): Promise<GasAnalytics> {
    const metrics = await this.getMetricsForTimeRange(timeRange);

    if (metrics.length === 0) {
      return this.getEmptyAnalytics();
    }

    const gasValues = metrics.map(m => m.gasUsed).sort((a, b) => Number(a - b));
    const totalGas = gasValues.reduce((sum, gas) => sum + gas, 0n);

    return {
      totalGasUsed: totalGas,
      averageGasPerTransaction: totalGas / BigInt(metrics.length),
      medianGasPerTransaction: gasValues[Math.floor(gasValues.length / 2)],
      minGasPerTransaction: gasValues[0],
      maxGasPerTransaction: gasValues[gasValues.length - 1],
      gasOptimizationPotential: this.calculateOptimizationPotential(metrics),
      costInUSD: this.calculateCostInUSD(totalGas)
    };
  }

  async getPerformanceAnalytics(): Promise<PerformanceAnalytics> {
    const metrics = this.performanceMetrics;

    const executionTimes = metrics.map(m => m.executionTimeMs).sort((a, b) => a - b);
    const memoryUsages = metrics.map(m => m.memoryUsedBytes);

    return {
      averageExecutionTimeMs: executionTimes.reduce((a, b) => a + b, 0) / executionTimes.length,
      medianExecutionTimeMs: executionTimes[Math.floor(executionTimes.length / 2)],
      p95ExecutionTimeMs: executionTimes[Math.floor(executionTimes.length * 0.95)],
      p99ExecutionTimeMs: executionTimes[Math.floor(executionTimes.length * 0.99)],
      maxExecutionTimeMs: Math.max(...executionTimes),
      minExecutionTimeMs: Math.min(...executionTimes),
      averageMemoryUsedBytes: memoryUsages.reduce((a, b) => a + b, 0) / memoryUsages.length,
      peakMemoryUsedBytes: Math.max(...memoryUsages)
    };
  }

  async getOptimizationSuggestions(): Promise<OptimizationSuggestion[]> {
    const suggestions: OptimizationSuggestion[] = [];

    // Analyze high gas operations
    const expensiveOps = this.metrics
      .sort((a, b) => Number(b.gasUsed - a.gasUsed))
      .slice(0, 10);

    expensiveOps.forEach(op => {
      if (op.gasUsed > 1000000n) {
        suggestions.push({
          type: 'gas_optimization',
          function: op.functionName,
          currentGas: op.gasUsed,
          recommendation: 'Consider storage packing or caching',
          severity: 'high'
        });
      }
    });

    // Analyze slow operations
    const slowOps = this.performanceMetrics
      .sort((a, b) => b.executionTimeMs - a.executionTimeMs)
      .slice(0, 5);

    slowOps.forEach(op => {
      if (op.executionTimeMs > 1000) {
        suggestions.push({
          type: 'performance',
          function: op.operationName,
          currentTime: op.executionTimeMs,
          recommendation: 'Consider database indexing or query optimization',
          severity: 'medium'
        });
      }
    });

    return suggestions;
  }

  private calculateOptimizationPotential(metrics: GasMetric[]): number {
    const avgGas = metrics.reduce((sum, m) => sum + m.gasUsed, 0n) / BigInt(metrics.length);
    const maxGas = metrics.reduce((max, m) => m.gasUsed > max ? m.gasUsed : max, 0n);
    
    return Number((maxGas - avgGas) * 100n / avgGas);
  }

  private calculateCostInUSD(gasUsed: bigint, ethPrice: number = 2000): number {
    const gasPriceInGwei = 20; // typical gas price
    const costInETH = Number(gasUsed) * gasPriceInGwei / 1e9;
    return costInETH * ethPrice;
  }
}
```

---

## 2. CSRF Protection Middleware (#182)

### Purpose
Prevent Cross-Site Request Forgery attacks by validating token integrity.

### Implementation

```typescript
interface CSRFTokenPayload {
  token: string;
  secret: string;
  expiresAt: Date;
  userAgent: string;
  ipAddress: string;
}

class CSRFProtectionMiddleware {
  private tokenStore: Map<string, CSRFTokenPayload> = new Map();
  private secret: string;

  constructor(secret?: string) {
    this.secret = secret || process.env.CSRF_SECRET || 'default-secret';
  }

  /**
   * Generate CSRF token for user session
   */
  generateToken(req: Request): string {
    const userId = req.user?.id || req.ip;
    const token = this.createSecureToken();
    
    const payload: CSRFTokenPayload = {
      token,
      secret: this.secret,
      expiresAt: new Date(Date.now() + 60 * 60 * 1000), // 1 hour
      userAgent: req.get('user-agent') || '',
      ipAddress: req.ip || ''
    };

    this.tokenStore.set(token, payload);
    return token;
  }

  /**
   * Middleware to validate CSRF token
   */
  middleware() {
    return (req: Request, res: Response, next: NextFunction) => {
      // Skip validation for safe methods (GET, HEAD, OPTIONS)
      if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
        return next();
      }

      const token = this.extractToken(req);

      if (!token) {
        return res.status(403).json({
          error: 'CSRF token missing',
          code: 'CSRF_TOKEN_MISSING'
        });
      }

      const isValid = this.validateToken(token, req);

      if (!isValid) {
        return res.status(403).json({
          error: 'CSRF token invalid or expired',
          code: 'CSRF_TOKEN_INVALID'
        });
      }

      // Token is valid, proceed
      next();
    };
  }

  private extractToken(req: Request): string | null {
    // Try multiple token sources
    // 1. Custom header
    if (req.get('x-csrf-token')) {
      return req.get('x-csrf-token') || null;
    }

    // 2. Body parameter
    if (req.body?.csrfToken) {
      return req.body.csrfToken;
    }

    // 3. Query parameter (not recommended)
    if (req.query?.csrfToken) {
      return String(req.query.csrfToken);
    }

    return null;
  }

  private validateToken(token: string, req: Request): boolean {
    const payload = this.tokenStore.get(token);

    if (!payload) {
      return false;
    }

    // Check expiration
    if (payload.expiresAt < new Date()) {
      this.tokenStore.delete(token);
      return false;
    }

    // Verify user agent and IP match
    if (payload.userAgent !== req.get('user-agent')) {
      return false;
    }

    if (payload.ipAddress !== req.ip) {
      return false;
    }

    // Token is valid, delete it (one-time use)
    this.tokenStore.delete(token);

    return true;
  }

  private createSecureToken(): string {
    return require('crypto').randomBytes(32).toString('hex');
  }
}

// Usage in Express
app.use(session({
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: true
}));

const csrfMiddleware = new CSRFProtectionMiddleware();

// Generate token for forms
app.get('/form', (req, res) => {
  const csrfToken = csrfMiddleware.generateToken(req);
  res.render('form', { csrfToken });
});

// Validate on POST
app.post('/form', csrfMiddleware.middleware(), (req, res) => {
  // Process form safely
  res.json({ success: true });
});
```

---

## 3. Content Security Policy (CSP) Headers (#183)

### Purpose
Mitigate XSS attacks by controlling allowed content sources.

### Implementation

```typescript
interface CSPConfig {
  directives: CSPDirectives;
  reportUri?: string;
  reportOnly?: boolean;
}

interface CSPDirectives {
  defaultSrc?: string[];
  scriptSrc?: string[];
  styleSrc?: string[];
  imgSrc?: string[];
  fontSrc?: string[];
  connectSrc?: string[];
  frameSrc?: string[];
  objectSrc?: string[];
  mediaSrc?: string[];
  childSrc?: string[];
  formAction?: string[];
  frameAncestors?: string[];
  baseUri?: string[];
}

class ContentSecurityPolicyMiddleware {
  private config: CSPConfig;

  constructor(config?: Partial<CSPConfig>) {
    this.config = {
      directives: {
        defaultSrc: ["'self'"],
        scriptSrc: ["'self'", "'strict-dynamic'"],
        styleSrc: ["'self'", "'unsafe-inline'"], // Consider removing unsafe-inline
        imgSrc: ["'self'", 'data:', 'https:'],
        fontSrc: ["'self'", 'https:', 'data:'],
        connectSrc: ["'self'"],
        frameSrc: ["'none'"],
        objectSrc: ["'none'"],
        mediaSrc: ["'self'"],
        childSrc: ["'self'"],
        formAction: ["'self'"],
        frameAncestors: ["'none'"],
        baseUri: ["'self'"]
      },
      reportOnly: false,
      ...config
    };
  }

  middleware() {
    return (req: Request, res: Response, next: NextFunction) => {
      const headerName = this.config.reportOnly
        ? 'Content-Security-Policy-Report-Only'
        : 'Content-Security-Policy';

      const headerValue = this.buildCSPHeader();

      res.set(headerName, headerValue);
      next();
    };
  }

  private buildCSPHeader(): string {
    const directives: string[] = [];

    for (const [key, values] of Object.entries(this.config.directives)) {
      if (values && values.length > 0) {
        const directiveName = this.convertToDashCase(key);
        directives.push(`${directiveName} ${values.join(' ')}`);
      }
    }

    if (this.config.reportUri) {
      directives.push(`report-uri ${this.config.reportUri}`);
    }

    return directives.join('; ');
  }

  private convertToDashCase(str: string): string {
    return str.replace(/([A-Z])/g, '-$1').toLowerCase();
  }
}

// CSP Configuration Examples

// Strict CSP (most secure)
const strictCSP = new ContentSecurityPolicyMiddleware({
  directives: {
    defaultSrc: ["'none'"],
    scriptSrc: ["'self'"],
    styleSrc: ["'self'"],
    imgSrc: ["'self'"],
    fontSrc: ["'self'"],
    connectSrc: ["'self'"],
    frameSrc: ["'none'"],
    objectSrc: ["'none'"],
    baseUri: ["'self'"],
    formAction: ["'self'"],
    frameAncestors: ["'none'"]
  },
  reportOnly: true,
  reportUri: '/csp-report'
});

// Development CSP (more permissive)
const devCSP = new ContentSecurityPolicyMiddleware({
  directives: {
    defaultSrc: ["'self'"],
    scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'", 'http://localhost:*'],
    styleSrc: ["'self'", "'unsafe-inline'"],
    imgSrc: ["'self'", 'data:', 'https:'],
    connectSrc: ["'self'", 'http://localhost:*']
  },
  reportOnly: true
});

// Usage in Express
app.use(strictCSP.middleware());

// CSP Violation Reporter
app.post('/csp-report', (req: Request, res: Response) => {
  const violation = req.body;
  
  console.error('CSP Violation:', {
    'document-uri': violation['document-uri'],
    'violated-directive': violation['violated-directive'],
    'blocked-uri': violation['blocked-uri'],
    'original-policy': violation['original-policy']
  });

  // Store violation in database for analysis
  // Track trends and patterns

  res.status(204).send();
});
```

---

## 4. Environment Variable Encryption (#184)

### Purpose
Encrypt sensitive environment variables to prevent exposure in logs and memory dumps.

### Implementation

```typescript
interface EncryptedEnvVar {
  key: string;
  encrypted: string;
  iv: string;
  salt: string;
  algorithm: string;
  createdAt: Date;
}

class EnvironmentVariableEncryption {
  private algorithm = 'aes-256-gcm';
  private encoding = 'hex';
  private masterKey: Buffer;

  constructor(masterKey?: string) {
    if (!masterKey) {
      throw new Error('Master key required for encryption');
    }
    
    // Derive key from master key
    this.masterKey = this.deriveKey(masterKey);
  }

  /**
   * Encrypt a sensitive environment variable
   */
  encrypt(value: string): EncryptedEnvVar {
    const iv = require('crypto').randomBytes(16);
    const salt = require('crypto').randomBytes(16);
    
    const cipher = require('crypto').createCipheriv(this.algorithm, this.masterKey, iv);
    
    let encrypted = cipher.update(value, 'utf8', this.encoding);
    encrypted += cipher.final(this.encoding);
    
    const authTag = cipher.getAuthTag();

    return {
      key: 'env',
      encrypted: encrypted + authTag.toString(this.encoding),
      iv: iv.toString(this.encoding),
      salt: salt.toString(this.encoding),
      algorithm: this.algorithm,
      createdAt: new Date()
    };
  }

  /**
   * Decrypt an encrypted environment variable
   */
  decrypt(encrypted: EncryptedEnvVar): string {
    try {
      const iv = Buffer.from(encrypted.iv, this.encoding);
      const encryptedData = encrypted.encrypted;
      
      // Extract auth tag (last 16 bytes)
      const authTag = Buffer.from(
        encryptedData.slice(-32),
        this.encoding
      );
      const encryptedText = encryptedData.slice(0, -32);

      const decipher = require('crypto').createDecipheriv(
        this.algorithm,
        this.masterKey,
        iv
      );
      
      decipher.setAuthTag(authTag);

      let decrypted = decipher.update(encryptedText, this.encoding, 'utf8');
      decrypted += decipher.final('utf8');

      return decrypted;
    } catch (error) {
      throw new Error('Failed to decrypt environment variable');
    }
  }

  /**
   * Load and decrypt environment variables
   */
  loadEncryptedEnv(filePath: string): void {
    const fs = require('fs');
    const encryptedVars = JSON.parse(fs.readFileSync(filePath, 'utf8'));

    Object.entries(encryptedVars).forEach(([key, encrypted]) => {
      try {
        const decrypted = this.decrypt(encrypted as EncryptedEnvVar);
        process.env[key] = decrypted;
      } catch (error) {
        console.error(`Failed to decrypt ${key}:`, error.message);
      }
    });
  }

  /**
   * Save encrypted environment variables
   */
  saveEncryptedEnv(vars: Record<string, string>, filePath: string): void {
    const encryptedVars: Record<string, EncryptedEnvVar> = {};

    Object.entries(vars).forEach(([key, value]) => {
      encryptedVars[key] = this.encrypt(value);
    });

    const fs = require('fs');
    fs.writeFileSync(filePath, JSON.stringify(encryptedVars, null, 2));
    
    // Secure file permissions
    fs.chmodSync(filePath, 0o600); // Read/write for owner only
  }

  private deriveKey(masterKey: string): Buffer {
    // Use PBKDF2 to derive a strong key
    const iterations = 100000;
    const digest = 'sha256';
    
    return require('crypto').pbkdf2Sync(
      masterKey,
      'arbitra-salt', // Use a fixed salt (consider parameterizing)
      iterations,
      32,
      digest
    );
  }

  /**
   * Rotate encryption key (re-encrypt all variables)
   */
  rotateKey(oldMasterKey: string, newMasterKey: string, filePath: string): void {
    // Create decryption instance with old key
    const oldEncryption = new EnvironmentVariableEncryption(oldMasterKey);
    
    // Load and decrypt with old key
    const fs = require('fs');
    const encryptedVars = JSON.parse(fs.readFileSync(filePath, 'utf8'));
    const decryptedVars: Record<string, string> = {};

    Object.entries(encryptedVars).forEach(([key, encrypted]) => {
      try {
        decryptedVars[key] = oldEncryption.decrypt(encrypted as EncryptedEnvVar);
      } catch (error) {
        console.error(`Failed to decrypt ${key} during rotation`);
      }
    });

    // Create encryption instance with new key
    this.masterKey = this.deriveKey(newMasterKey);
    
    // Save with new key
    this.saveEncryptedEnv(decryptedVars, filePath);
  }
}

// Usage Example
const encryptionManager = new EnvironmentVariableEncryption(
  process.env.ENCRYPTION_MASTER_KEY
);

// At startup, load encrypted env vars
encryptionManager.loadEncryptedEnv('.env.encrypted');

// Sensitive values are now available in process.env

// Never log or expose sensitive values
const dbPassword = process.env.DATABASE_PASSWORD;
console.log('Connected to database'); // Safe: doesn't log password
```

---

## Security Checklist

- [ ] Gas Metrics
  - [ ] Collect transaction gas data
  - [ ] Calculate analytics
  - [ ] Generate optimization suggestions
  - [ ] Monitor performance metrics
  - [ ] Set up alerting for anomalies

- [ ] CSRF Protection
  - [ ] Generate secure tokens
  - [ ] Validate token on mutations
  - [ ] Implement token expiration
  - [ ] Verify user context
  - [ ] Log CSRF attempts

- [ ] CSP Headers
  - [ ] Configure strict directives
  - [ ] Set up violation reporting
  - [ ] Test in report-only mode
  - [ ] Monitor violations
  - [ ] Update policies as needed

- [ ] Environment Encryption
  - [ ] Generate master key
  - [ ] Encrypt sensitive variables
  - [ ] Implement key rotation
  - [ ] Load at startup
  - [ ] Never log decrypted values

## Related Documentation

- [OWASP CSRF Prevention Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html)
- [Content Security Policy Reference](https://content-security-policy.com/)
- [Gas Optimization in Solidity](https://docs.soliditylang.org/en/latest/internals/optimizer.html)
- [Cryptography Best Practices](https://nodejs.org/en/docs/guides/security/)
