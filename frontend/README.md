<div align="center">
  <img src="./public/logo.png" alt="Arbitra Logo" width="120" />
  <h1>Arbitra Frontend</h1>
</div>

This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Architecture

The frontend follows a **clean separation of concerns** with dedicated service and utility layers:

- **`lib/services/`** - Encapsulated business logic (notifications, Stellar accounts)
- **`lib/errors/`** - Centralized error handling, classification, and logging
- **`lib/api/`** - API client and request/response handling
- **`lib/validation/`** - Input validation and schema utilities
- **`lib/query/`** - Query composition and data fetching
- **`components/`** - Reusable UI components with error boundaries

This structure makes it easy to:

- Add new features without affecting existing code (Single Responsibility)
- Test components and services in isolation
- Extend functionality without breaking changes

## Getting Started

### Map Feature

The interactive map feature uses **Leaflet with OpenStreetMap** - **no API key required!**

- ✅ 100% free
- ✅ No setup needed
- ✅ Works immediately
- ✅ No usage limits

See [LEAFLET_SETUP.md](./LEAFLET_SETUP.md) for more details.

### Property Listing Wizard

The property listing flow is available at `/user/properties/add` with:

- 8 guided steps (basic info through preview/publish)
- progress indicator and listing completeness score
- auto-save + manual save draft support
- resume-later behavior through server-backed draft records
- preview-and-publish action for completed listings

### Running the Development Server

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Error Handling & Resilience

The frontend includes a **centralized, composable error handling system** following the same builder pattern used in the backend:

### Core Components

- **`lib/errors/classifier.ts`** - Normalize and classify errors from any source
- **`lib/errors/logger.ts`** - Structured error logging with context preservation
- **`lib/errors/retry.ts`** - Retry strategies with exponential backoff
- **`components/error/ErrorFallback.tsx`** - Reusable fallback UI with recovery actions
- **`components/error/ClientErrorBoundary.tsx`** - Component-level React error boundaries
- **`components/error/ErrorMonitoringProvider.tsx`** - Global error capture and monitoring

### Usage Patterns

Each layer has a single, clear responsibility:

```typescript
// Classify any error into a typed structure
const typedError = classifyUnknownError(error);

// Log with structured context
logError('payment_failed', typedError, { userId, amount });

// Wrap critical sections with local recovery
<ClientErrorBoundary fallback={<ErrorFallback onRetry={retry} />}>
  <PaymentForm />
</ClientErrorBoundary>
```

### Monitoring Integration

Optional external reporting (Sentry, Datadog, etc.):

```ts
window.__ARBITRA_ERROR_REPORTER__ = (payload) => {
  // Forward to monitoring provider
};
```

## Development Workflow

### Running Tests

```bash
make test              # Run unit tests
make test-watch       # Run tests in watch mode
```

### Code Quality

```bash
make lint             # Run ESLint
make format           # Format with Prettier
make format-check     # Check formatting
```

### Building for Production

```bash
make build            # Create production build
make ci               # Full pipeline (install → audit → lint → test → build)
make pre-commit       # Quick pre-PR validation
```

The Makefile mirrors the CI/CD pipeline in `.github/workflows/frontend-ci-cd.yml`, giving you confidence that local tests match what runs in GitHub Actions.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
