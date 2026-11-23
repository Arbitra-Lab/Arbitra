# Visual Regression Testing Guide

## Overview

Visual regression testing is a critical QA practice that ensures UI components render consistently across updates. This document provides guidelines for implementing visual regression testing in the Arbitra project.

## What is Visual Regression Testing?

Visual regression testing compares screenshots of UI components against baseline images to detect unintended visual changes. It catches:

- Layout shifts
- Color changes
- Font rendering issues
- Border/shadow rendering differences
- Component alignment problems
- Responsive design breakages
- Cross-browser rendering inconsistencies

## Testing Tools & Approaches

### 1. Snapshot-Based Testing

#### Using Vitest + Playwright

```typescript
import { test, expect } from '@playwright/test';

test('button component renders correctly', async ({ page }) => {
  await page.goto('/components/button');
  
  const button = page.locator('button.primary');
  await expect(button).toHaveScreenshot('button.png');
});
```

#### Storing Baselines

- Store baseline images in: `frontend/__screenshots__/`
- Organize by component: `__screenshots__/components/<component-name>/`
- Include variant subfolder: `__screenshots__/components/button/primary.png`

### 2. Percy.io Integration (Recommended for CI/CD)

Percy is a visual regression testing platform:

```bash
npm install --save-dev @percy/cli @percy/playwright
```

```typescript
import percySnapshot from '@percy/playwright';

test('capture button visual regression', async ({ page }) => {
  await page.goto('/components/button');
  await percySnapshot(page, 'Button Component');
});
```

### 3. BackstopJS Alternative

A standalone visual regression tool:

```bash
npm install --save-dev backstopjs
```

Configuration in `backstop.json`:

```json
{
  "viewports": [
    { "label": "mobile", "width": 375, "height": 667 },
    { "label": "tablet", "width": 768, "height": 1024 },
    { "label": "desktop", "width": 1440, "height": 900 }
  ],
  "scenarios": [
    {
      "label": "Homepage",
      "url": "http://localhost:3000",
      "referenceUrl": "https://production.example.com"
    }
  ]
}
```

## Implementation Strategy

### Component Coverage

#### Priority 1: Critical Components (Test First)
- Navigation menu
- Buttons and form controls
- Modals and dialogs
- Cards and list items
- Header and footer

#### Priority 2: Page Layouts
- Dashboard layouts
- Property listing pages
- User profile pages
- Settings pages

#### Priority 3: Interactive States
- Hover states
- Focus states
- Active/selected states
- Disabled states
- Error states
- Loading states

### Responsive Variants

Test multiple viewport sizes:

```typescript
const viewports = {
  mobile: { width: 375, height: 667 },
  tablet: { width: 768, height: 1024 },
  desktop: { width: 1440, height: 900 }
};

Object.entries(viewports).forEach(([name, size]) => {
  test(`button renders correctly on ${name}`, async ({ page }) => {
    await page.setViewportSize(size);
    await page.goto('/components/button');
    await expect(page).toHaveScreenshot(`button-${name}.png`);
  });
});
```

## Best Practices

### 1. Test Stable States

```typescript
// Good: Test rendered component
test('renders all data', async ({ page }) => {
  // Wait for data to load
  await page.waitForSelector('[data-testid="loaded-content"]');
  
  // Take snapshot of stable state
  await expect(page).toHaveScreenshot('component.png');
});

// Bad: Test loading/transitional state
test('renders during loading', async ({ page }) => {
  // Transitional states are unreliable
  await expect(page).toHaveScreenshot('loading.png');
});
```

### 2. Manage Flakiness

```typescript
test('component with dynamic content', async ({ page }) => {
  // Hide dynamic content
  await page.evaluate(() => {
    document.querySelector('[data-dynamic]').style.visibility = 'hidden';
  });
  
  // Now take stable snapshot
  await expect(page).toHaveScreenshot('component.png');
});
```

### 3. Test Dark Mode Variants

```typescript
test('button in dark mode', async ({ page }) => {
  // Set dark mode
  await page.evaluate(() => {
    document.documentElement.classList.add('dark');
  });
  
  await expect(page).toHaveScreenshot('button-dark.png');
});

test('button in light mode', async ({ page }) => {
  // Ensure light mode
  await page.evaluate(() => {
    document.documentElement.classList.remove('dark');
  });
  
  await expect(page).toHaveScreenshot('button-light.png');
});
```

### 4. Cross-Browser Testing

```typescript
// Run against multiple browsers in CI
// In playwright.config.ts
projects: [
  {
    name: 'chromium',
    use: { ...devices['Desktop Chrome'] }
  },
  {
    name: 'firefox',
    use: { ...devices['Desktop Firefox'] }
  },
  {
    name: 'webkit',
    use: { ...devices['Desktop Safari'] }
  }
]
```

### 5. Semantic Stability

```typescript
test('component with animation', async ({ page }) => {
  // Wait for animation to complete
  await page.evaluate(() => {
    // Disable animations for testing
    const style = document.createElement('style');
    style.textContent = '* { animation: none !important; transition: none !important; }';
    document.head.appendChild(style);
  });
  
  await expect(page).toHaveScreenshot('component.png');
});
```

## Maintenance of Baselines

### Approving New Baselines

```bash
# After code changes, update baselines
npm run test:visual -- --update-snapshots
```

### Reviewing Changes

```bash
# Generate report comparing old vs new
npm run test:visual -- --report
```

Review process:
1. Run visual regression tests
2. Review differences in baseline comparison tool
3. If changes are intentional, approve new baseline
4. If unintended, fix code and re-run tests

### Organizing Baselines

```
frontend/__screenshots__/
├── components/
│   ├── button/
│   │   ├── primary.png
│   │   ├── secondary.png
│   │   ├── disabled.png
│   │   └── loading.png
│   ├── modal/
│   │   ├── default.png
│   │   └── mobile.png
│   └── navigation/
│       ├── expanded.png
│       └── collapsed.png
├── pages/
│   ├── dashboard/
│   │   ├── desktop.png
│   │   └── mobile.png
│   └── property-listing/
│       ├── empty-state.png
│       └── with-data.png
```

## CI/CD Integration

### GitHub Actions Setup

```yaml
name: Visual Regression Tests

on: [pull_request, push]

jobs:
  visual-tests:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      
      - uses: actions/setup-node@v3
        with:
          node-version: '18'
      
      - name: Install dependencies
        run: npm ci
      
      - name: Run visual regression tests
        run: npm run test:visual
      
      - name: Upload test results
        if: always()
        uses: actions/upload-artifact@v3
        with:
          name: visual-regression-report
          path: test-results/
      
      - name: Comment on PR
        if: failure()
        uses: actions/github-script@v6
        with:
          script: |
            github.rest.issues.createComment({
              issue_number: context.issue.number,
              owner: context.repo.owner,
              repo: context.repo.repo,
              body: 'Visual regression tests failed. Check the artifacts.'
            })
```

### Local Testing

```bash
# Run visual regression tests
npm run test:visual

# Update baselines after intentional changes
npm run test:visual -- --update-snapshots

# Generate HTML report
npm run test:visual -- --reporter=html
```

## Specific Component Testing Guide

### Buttons

```typescript
test.describe('Button Component', () => {
  const states = ['default', 'hover', 'active', 'disabled', 'loading'];
  const sizes = ['sm', 'md', 'lg'];
  const variants = ['primary', 'secondary', 'danger'];
  
  for (const variant of variants) {
    for (const state of states) {
      for (const size of sizes) {
        test(`button ${variant} ${state} ${size}`, async ({ page }) => {
          const selector = `[data-testid="button-${variant}-${state}-${size}"]`;
          await page.goto('/storybook');
          await expect(page.locator(selector)).toHaveScreenshot(
            `button-${variant}-${state}-${size}.png`
          );
        });
      }
    }
  }
});
```

### Forms

```typescript
test.describe('Form Components', () => {
  test('text input - default', async ({ page }) => {
    await page.goto('/components/input');
    await expect(page.locator('[data-testid="input-text"]')).toHaveScreenshot();
  });
  
  test('text input - focused', async ({ page }) => {
    await page.goto('/components/input');
    await page.locator('input').focus();
    await expect(page.locator('[data-testid="input-text"]')).toHaveScreenshot();
  });
  
  test('text input - error state', async ({ page }) => {
    await page.goto('/components/input?state=error');
    await expect(page.locator('[data-testid="input-text"]')).toHaveScreenshot();
  });
});
```

### Responsive Variants

```typescript
const breakpoints = {
  mobile: 375,
  tablet: 768,
  desktop: 1440
};

Object.entries(breakpoints).forEach(([name, width]) => {
  test(`card layout - ${name}`, async ({ page }) => {
    await page.setViewportSize({ width, height: 800 });
    await page.goto('/components/card');
    await expect(page).toHaveScreenshot(`card-${name}.png`);
  });
});
```

## Handling Flaky Tests

### Dynamic Content
```typescript
// Hide dynamic dates/timestamps
await page.evaluate(() => {
  document.querySelectorAll('[data-dynamic]').forEach(el => {
    el.textContent = 'DYNAMIC_CONTENT';
  });
});
```

### API Responses
```typescript
// Mock API responses for consistency
await page.route('**/api/**', route => {
  route.abort('blockedbyClient');
});

// Or intercept with fixed data
await page.route('**/api/users', route => {
  route.fulfill({
    status: 200,
    body: JSON.stringify(mockData)
  });
});
```

### Animations
```typescript
// Disable animations during testing
await page.evaluate(() => {
  const style = document.createElement('style');
  style.innerHTML = `
    * { animation: none !important; transition: none !important; }
  `;
  document.head.appendChild(style);
});
```

## Metrics & Reporting

### Track Test Coverage
- Component coverage: X% of components have visual regression tests
- Variant coverage: All major states tested
- Responsive coverage: All breakpoints tested

### Sample Report Structure
```
Visual Regression Test Results
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
✓ Components: 42 passed, 0 failed
✓ Pages: 15 passed, 0 failed
✓ Total: 57 baseline snapshots

Coverage by Category:
├─ Buttons: 24/24 (100%)
├─ Forms: 18/20 (90%)
├─ Modals: 8/8 (100%)
└─ Navigation: 7/7 (100%)

Total Coverage: 93%
```

## Related Documentation

- [Playwright Documentation](https://playwright.dev/)
- [Percy Documentation](https://percy.io/docs)
- [BackstopJS Docs](https://garris.github.io/BackstopJS/)
- [Web.dev - Visual Testing](https://web.dev/visual-tests/)

## Troubleshooting

### Snapshots Keep Failing for Same Component
1. Check for environment-specific rendering (browser differences)
2. Verify no random/dynamic content
3. Check for font loading delays
4. Ensure animations are disabled

### CI Snapshots Different from Local
1. Use same OS for local and CI (use Docker)
2. Ensure same Node version
3. Check timezone/locale settings
4. Verify browser version matches

### High False Positive Rate
1. Increase threshold tolerance slightly
2. Mask known dynamic areas
3. Use semantic snapshots
4. Review baseline approval process

## Future Enhancements

- [ ] Integrate with Percy CI
- [ ] Add cross-browser visual testing
- [ ] Implement semantic visual testing
- [ ] Add accessibility + visual regression checks
- [ ] Create visual regression dashboard
- [ ] Implement baseline diffing UI
- [ ] Add fuzzy image matching
