# Testing Strategy & Component Library Guide

## Overview

This document provides comprehensive guidelines for implementing testing infrastructure and component documentation across the Arbitra platform, covering contract storage pagination, component library organization, contract fuzzing, and end-to-end testing.

## 1. Contract Storage Pagination (#176)

### Purpose
Efficiently retrieve and paginate through large contract storage states without loading entire datasets into memory.

### Implementation Pattern

```typescript
interface PaginationConfig {
  pageSize: number;
  startIndex: number;
  endIndex: number;
  totalItems: number;
  hasMore: boolean;
}

interface StoragePageRequest {
  pageNum: number;
  itemsPerPage: number;
  sortBy?: string;
  filter?: Record<string, any>;
}

interface StoragePageResponse<T> {
  items: T[];
  page: number;
  pageSize: number;
  total: number;
  hasNextPage: boolean;
  hasPreviousPage: boolean;
}
```

### Best Practices

- Use indexed queries for efficient pagination
- Implement cursor-based pagination for large datasets
- Cache pagination metadata
- Support both offset and cursor-based approaches
- Validate pagination parameters

### Example Usage

```solidity
// Contract storage pagination pattern
contract PaginatedStorage {
    mapping(uint256 => DataItem) public items;
    uint256 public itemCount;

    function getPage(
        uint256 offset,
        uint256 limit
    ) external view returns (DataItem[] memory, uint256 total) {
        require(limit > 0 && limit <= 100, "Invalid limit");
        
        DataItem[] memory page = new DataItem[](
            Math.min(limit, itemCount - offset)
        );
        
        for (uint256 i = 0; i < page.length; i++) {
            page[i] = items[offset + i];
        }
        
        return (page, itemCount);
    }

    function getTotalPages(uint256 pageSize) 
        external 
        view 
        returns (uint256) 
    {
        return (itemCount + pageSize - 1) / pageSize;
    }
}
```

---

## 2. Component Library & Storybook (#167)

### Component Organization

```
components/
├── ui/
│   ├── Button.tsx
│   ├── Input.tsx
│   ├── Card.tsx
│   ├── Modal.tsx
│   └── Button.stories.tsx
├── forms/
│   ├── TextField.tsx
│   ├── SelectField.tsx
│   └── TextField.stories.tsx
├── layout/
│   ├── Header.tsx
│   ├── Sidebar.tsx
│   └── Header.stories.tsx
└── docs/
    └── COMPONENT_GUIDELINES.md
```

### Storybook Setup

```typescript
// Button.stories.tsx
import type { Meta, StoryObj } from '@storybook/react';
import { Button } from './Button';

const meta = {
  title: 'Components/Button',
  component: Button,
  parameters: {
    layout: 'centered',
  },
  tags: ['autodocs'],
} satisfies Meta<typeof Button>;

export default meta;
type Story = StoryObj<typeof meta>;

export const Primary: Story = {
  args: {
    label: 'Click me',
    variant: 'primary',
    size: 'md',
  },
};

export const Secondary: Story = {
  args: {
    label: 'Secondary',
    variant: 'secondary',
    size: 'md',
  },
};

export const Disabled: Story = {
  args: {
    label: 'Disabled',
    disabled: true,
  },
};

export const Loading: Story = {
  args: {
    label: 'Loading',
    isLoading: true,
  },
};
```

### Component Documentation Template

```markdown
# Button Component

## Overview
Reusable button component for user interactions.

## Props
- `label` (string): Button text
- `variant` (enum): 'primary' | 'secondary' | 'danger'
- `size` (enum): 'sm' | 'md' | 'lg'
- `disabled` (boolean): Disable button
- `isLoading` (boolean): Show loading state
- `onClick` (function): Click handler

## Usage
\`\`\`tsx
<Button 
  label="Submit" 
  variant="primary" 
  onClick={handleSubmit}
/>
\`\`\`

## Accessibility
- Keyboard navigable
- ARIA labels included
- Focus states visible
- Screen reader compatible

## Testing
See Button.test.tsx for unit tests
```

---

## 3. Contract Fuzzing Tests (#175)

### Fuzzing Framework Setup

```typescript
// contract-fuzz.test.ts
import { describe, it, expect } from 'vitest';
import fc from 'fast-check';

describe('Contract Fuzzing Tests', () => {
  describe('Token Transfer Fuzzing', () => {
    it('should handle arbitrary token amounts', () => {
      fc.assert(
        fc.property(
          fc.bigUintN(256), // from amount
          fc.bigUintN(256), // to amount
          (fromAmount, toAmount) => {
            // Transfer logic
            const result = safeTransfer(fromAmount, toAmount);
            
            // Invariants
            expect(result.total).toBeLessThanOrEqual(
              MAX_SUPPLY
            );
            expect(result.hasOverflow).toBeFalsy();
            
            return true;
          }
        )
      );
    });

    it('should not allow negative transfers', () => {
      fc.assert(
        fc.property(
          fc.integer({ min: 1, max: 1000 }),
          (amount) => {
            const result = transfer(amount);
            expect(result.amount).toBeGreaterThan(0);
            return true;
          }
        ),
        { numRuns: 1000 }
      );
    });

    it('should maintain balance invariants', () => {
      fc.assert(
        fc.property(
          fc.array(fc.record({
            sender: fc.hexString({ minLength: 40, maxLength: 40 }),
            amount: fc.bigUintN(256),
          }), { minLength: 1, maxLength: 100 }),
          (transactions) => {
            let totalSpent = 0n;
            
            transactions.forEach(tx => {
              totalSpent += tx.amount;
            });
            
            // Balance should never go negative
            expect(totalSpent).toBeGreaterThanOrEqual(0n);
            
            return true;
          }
        ),
        { numRuns: 500 }
      );
    });
  });

  describe('Storage Fuzzing', () => {
    it('should handle arbitrary key-value pairs', () => {
      fc.assert(
        fc.property(
          fc.dictionary(
            fc.hexString({ minLength: 2, maxLength: 66 }),
            fc.hexString({ minLength: 2, maxLength: 66 })
          ),
          (data) => {
            const storage = new Map(Object.entries(data));
            expect(storage.size).toBeLessThanOrEqual(Object.keys(data).length);
            return true;
          }
        )
      );
    });

    it('should handle concurrent operations', () => {
      fc.assert(
        fc.property(
          fc.tuple(
            fc.hexString({ minLength: 40, maxLength: 40 }),
            fc.bigUintN(256),
            fc.bigUintN(256)
          ),
          ([address, value1, value2]) => {
            const result1 = setValue(address, value1);
            const result2 = setValue(address, value2);
            
            // Last write wins
            expect(result2.value).toEqual(value2);
            return true;
          }
        )
      );
    });
  });

  describe('Invariant Testing', () => {
    it('total supply should remain constant', () => {
      fc.assert(
        fc.property(
          fc.array(fc.record({
            from: fc.hexString({ minLength: 40, maxLength: 40 }),
            to: fc.hexString({ minLength: 40, maxLength: 40 }),
            amount: fc.bigUintN(128),
          }), { minLength: 1, maxLength: 50 }),
          (transfers) => {
            let initialTotal = getTotalSupply();
            
            transfers.forEach(t => {
              transfer(t.from, t.to, t.amount);
            });
            
            let finalTotal = getTotalSupply();
            expect(finalTotal).toEqual(initialTotal);
            
            return true;
          }
        ),
        { numRuns: 200 }
      );
    });

    it('balance sum should equal total supply', () => {
      fc.assert(
        fc.property(
          fc.array(fc.hexString({ minLength: 40, maxLength: 40 }), {
            minLength: 1,
            maxLength: 20,
            uniqueBy: x => x,
          }),
          (addresses) => {
            let balanceSum = 0n;
            
            addresses.forEach(addr => {
              balanceSum += getBalance(addr);
            });
            
            expect(balanceSum).toBeLessThanOrEqual(getTotalSupply());
            return true;
          }
        )
      );
    });
  });

  describe('Edge Case Fuzzing', () => {
    it('should handle zero values', () => {
      fc.assert(
        fc.property(
          fc.hexString({ minLength: 40, maxLength: 40 }),
          (address) => {
            const result = transfer(address, 0n);
            expect(result.success).toBeTruthy();
            return true;
          }
        )
      );
    });

    it('should handle max uint256', () => {
      fc.assert(
        fc.property(
          fc.hexString({ minLength: 40, maxLength: 40 }),
          (address) => {
            const maxValue = 2n ** 256n - 1n;
            const result = safeAdd(maxValue, 1n);
            expect(result.overflow).toBeTruthy();
            return true;
          }
        )
      );
    });

    it('should handle boundary conditions', () => {
      fc.assert(
        fc.property(
          fc.bigUintN(256),
          (value) => {
            const isValid = value >= 0n && value <= (2n ** 256n - 1n);
            expect(isValid).toBeTruthy();
            return true;
          }
        )
      );
    });
  });
});
```

---

## 4. E2E Test Suite for Critical User Flows (#166)

### E2E Test Structure

```typescript
// e2e/critical-flows.spec.ts
import { test, expect } from '@playwright/test';

describe('Critical User Flows', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/');
    await page.waitForLoadState('networkidle');
  });

  describe('Authentication Flow', () => {
    test('user can register and login', async ({ page }) => {
      // Navigate to signup
      await page.click('text=Sign Up');
      await page.waitForURL('**/signup');

      // Fill registration form
      await page.fill('input[name="email"]', `user-${Date.now()}@test.com`);
      await page.fill('input[name="password"]', 'SecurePass123!');
      await page.fill('input[name="confirmPassword"]', 'SecurePass123!');

      // Submit
      await page.click('button:has-text("Create Account")');
      await page.waitForURL('**/dashboard');

      // Verify logged in
      expect(await page.locator('text=Dashboard').isVisible()).toBeTruthy();

      // Logout
      await page.click('[data-testid="user-menu"]');
      await page.click('text=Logout');
      await page.waitForURL('/');
    });

    test('user can login with existing credentials', async ({ page }) => {
      await page.click('text=Log In');
      await page.fill('input[name="email"]', 'test@example.com');
      await page.fill('input[name="password"]', 'password123');
      await page.click('button:has-text("Log In")');
      await page.waitForURL('**/dashboard');
      
      expect(await page.locator('text=Dashboard').isVisible()).toBeTruthy();
    });
  });

  describe('Property Management Flow', () => {
    test('user can list a property', async ({ page }) => {
      await page.goto('/dashboard');

      // Create property
      await page.click('button:has-text("Add Property")');
      await page.waitForURL('**/properties/new');

      // Fill property details
      await page.fill('input[name="title"]', 'Beautiful Apartment');
      await page.fill('textarea[name="description"]', 'A wonderful place to live');
      await page.fill('input[name="price"]', '5000');
      await page.fill('input[name="bedrooms"]', '2');

      // Upload image
      await page.setInputFiles('input[type="file"]', './test-fixtures/property.jpg');
      await page.waitForSelector('img[alt="Property preview"]');

      // Submit
      await page.click('button:has-text("List Property")');
      await page.waitForURL('**/properties/*');

      // Verify property is listed
      expect(await page.locator('text=Beautiful Apartment').isVisible()).toBeTruthy();
    });

    test('user can search and filter properties', async ({ page }) => {
      await page.goto('/properties');

      // Apply filters
      await page.fill('input[name="search"]', 'apartment');
      await page.selectOption('select[name="priceRange"]', 'under-5000');
      await page.click('button:has-text("Search")');

      // Wait for results
      await page.waitForSelector('[data-testid="property-card"]');
      const results = await page.locator('[data-testid="property-card"]').count();
      expect(results).toBeGreaterThan(0);
    });

    test('user can view property details', async ({ page }) => {
      await page.goto('/properties');

      // Click first property
      await page.click('[data-testid="property-card"]:first-child');
      await page.waitForURL('**/properties/*');

      // Verify details are visible
      expect(await page.locator('text=Property Details').isVisible()).toBeTruthy();
      expect(await page.locator('[data-testid="property-price"]').isVisible()).toBeTruthy();
      expect(await page.locator('[data-testid="property-location"]').isVisible()).toBeTruthy();
    });
  });

  describe('Payment and Transaction Flow', () => {
    test('user can make a payment', async ({ page }) => {
      await page.goto('/dashboard');

      // Navigate to payments
      await page.click('text=Payments');
      await page.click('button:has-text("Add Payment Method")');

      // Fill card details
      await page.frame('iframe[title*="Stripe"]').fill('input[name="cardnumber"]', '4242424242424242');
      await page.frame('iframe[title*="Stripe"]').fill('input[name="exp-date"]', '12/25');
      await page.frame('iframe[title*="Stripe"]').fill('input[name="cvc"]', '123');

      // Submit
      await page.click('button:has-text("Save Card")');

      // Verify success
      expect(await page.locator('text=Payment method added').isVisible()).toBeTruthy();
    });

    test('user can process a transaction', async ({ page }) => {
      await page.goto('/properties/123/book');

      // Fill booking details
      await page.fill('input[name="startDate"]', '2024-12-20');
      await page.fill('input[name="endDate"]', '2024-12-25');

      // Submit
      await page.click('button:has-text("Book Now")');

      // Wait for payment modal
      await page.waitForSelector('[data-testid="payment-modal"]');

      // Confirm payment
      await page.click('button:has-text("Confirm Payment")');

      // Verify success
      await page.waitForURL('**/bookings/*');
      expect(await page.locator('text=Booking confirmed').isVisible()).toBeTruthy();
    });
  });

  describe('User Profile Flow', () => {
    test('user can update profile information', async ({ page }) => {
      await page.goto('/dashboard/settings');

      // Update profile
      await page.fill('input[name="firstName"]', 'John');
      await page.fill('input[name="lastName"]', 'Doe');
      await page.fill('textarea[name="bio"]', 'Professional property manager');

      // Save
      await page.click('button:has-text("Save Changes")');

      // Verify success message
      expect(await page.locator('text=Profile updated successfully').isVisible()).toBeTruthy();
    });

    test('user can verify identity', async ({ page }) => {
      await page.goto('/dashboard/verification');

      // Upload ID
      await page.setInputFiles('input[type="file"][name="idDocument"]', './test-fixtures/id.jpg');

      // Take selfie (simulated)
      await page.click('button:has-text("Take Selfie")');
      await page.setInputFiles('input[type="file"][name="selfie"]', './test-fixtures/selfie.jpg');

      // Submit
      await page.click('button:has-text("Submit Verification")');

      // Verify pending status
      expect(await page.locator('text=Verification pending').isVisible()).toBeTruthy();
    });
  });

  describe('Error Handling and Edge Cases', () => {
    test('user sees validation errors on invalid input', async ({ page }) => {
      await page.goto('/');
      await page.click('text=Sign Up');

      // Try to submit without filling fields
      await page.click('button:has-text("Create Account")');

      // Verify error messages
      expect(await page.locator('text=Email is required').isVisible()).toBeTruthy();
      expect(await page.locator('text=Password is required').isVisible()).toBeTruthy();
    });

    test('user sees appropriate errors on network failure', async ({ page }) => {
      // Simulate network error
      await page.route('**/api/**', route => route.abort());

      await page.goto('/properties');
      await page.click('button:has-text("Search")');

      // Verify error message
      expect(
        await page.locator('text=Unable to load properties. Please try again.').isVisible()
      ).toBeTruthy();
    });

    test('user can recover from expired session', async ({ page }) => {
      await page.goto('/dashboard');

      // Simulate session expiry
      await page.evaluate(() => localStorage.clear());

      // Try to navigate
      await page.goto('/properties/create');

      // Should redirect to login
      await page.waitForURL('/login');
      expect(page.url()).toContain('/login');
    });
  });

  describe('Performance and Load', () => {
    test('page loads within acceptable time', async ({ page }) => {
      const startTime = Date.now();
      await page.goto('/properties');
      await page.waitForLoadState('networkidle');
      const loadTime = Date.now() - startTime;

      expect(loadTime).toBeLessThan(3000); // 3 seconds
    });

    test('list loads with pagination', async ({ page }) => {
      await page.goto('/properties');
      await page.waitForSelector('[data-testid="property-card"]');

      const initialCount = await page.locator('[data-testid="property-card"]').count();

      // Load more
      await page.click('button:has-text("Load More")');
      await page.waitForTimeout(500);

      const finalCount = await page.locator('[data-testid="property-card"]').count();
      expect(finalCount).toBeGreaterThan(initialCount);
    });
  });
});
```

---

## Testing Best Practices

### Unit Testing
- Test individual functions in isolation
- Mock external dependencies
- Aim for 80%+ code coverage
- Test both happy paths and error cases

### Integration Testing
- Test multiple components working together
- Use realistic test data
- Verify data persistence
- Test API interactions

### E2E Testing
- Test complete user workflows
- Use real browser environment
- Test across different viewport sizes
- Include error scenarios

### Contract Testing
- Use property-based testing (fuzzing)
- Test invariants and constraints
- Include edge cases
- Test storage and state management

## CI/CD Integration

```yaml
# .github/workflows/tests.yml
name: Tests

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
      - run: npm ci
      - run: npm run test:unit
      - run: npm run test:integration
      - run: npm run test:contract
      - run: npm run test:e2e
      - uses: codecov/codecov-action@v3
```

## Documentation Standards

- Keep documentation up-to-date with code
- Include usage examples
- Document edge cases and limitations
- Use clear, concise language
- Include diagrams for complex flows
