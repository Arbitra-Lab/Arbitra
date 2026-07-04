# AI Development Guidelines for This Project

## Critical Rules for AI Assistants

When working on this project, you MUST follow these guidelines to ensure code quality and project stability.

## End-of-Task Requirements

Before completing ANY task, you MUST:

1. **Run Diagnostics**: Check for syntax, type, and linting errors
2. **Fix All Errors**: Address every error found - do not leave the codebase broken
3. **Verify Build**: Ensure the project builds successfully
4. **Run Tests**: Execute relevant tests to verify functionality (if tests exist)

## Project Structure

This is a monorepo with three main components:

- `frontend/` - Next.js application (TypeScript, React)
- `backend/` - NestJS application (TypeScript, Node.js)
- `contract/` - Soroban smart contracts (Rust, Stellar blockchain)

## Required Checks by Component

### Frontend Checks

```bash
# Navigate to frontend
cd frontend

# Install dependencies if needed
pnpm install

# Run type checking
pnpm run type-check

# Run linting
pnpm run lint

# Build the project
pnpm run build

# Run tests (if applicable)
pnpm run test
```

### Backend Checks

```bash
# Navigate to backend
cd backend

# Install dependencies if needed
pnpm install

# Run type checking
pnpm run build

# Run linting
pnpm run lint

# Run tests
pnpm run test

# Verify database migrations compile
pnpm run migration:show
```

### Contract Checks (Soroban Smart Contracts)

```bash
# Navigate to contract directory
cd contract

# Ensure Rust toolchain is installed
# Install from https://rustup.rs/ if needed

# Add wasm32 target if not already added
rustup target add wasm32-unknown-unknown

# Format check
cargo fmt --all -- --check

# Lint with clippy (strict mode)
cargo clippy --all-targets --all-features -- -D warnings

# Run all tests
cargo test

# Build for WebAssembly (production target)
cargo build --target wasm32-unknown-unknown --release

# Or use the convenience script
./check-all.sh
```

## Workflow for Every Task

1. **Make Changes**: Implement the requested feature or fix
2. **Check Diagnostics**: Use getDiagnostics tool on modified files
3. **Fix Errors**: Address all syntax, type, and linting issues
4. **Build Verification**: Run build commands for affected components
5. **Test Execution**: Run relevant tests if they exist
6. **Final Confirmation**: Verify no errors remain

## Error Handling Priority

1. **Syntax Errors**: Fix immediately - these break the build
2. **Type Errors**: Resolve all TypeScript errors (frontend/backend) and Rust compiler errors (contracts)
3. **Linting Errors**: Fix critical linting issues (ESLint for TS, Clippy for Rust)
4. **Linting Warnings**: Address when possible, document if intentional
5. **Test Failures**: Fix failing tests or update them appropriately
6. **WASM Build Errors**: Ensure contracts compile to wasm32-unknown-unknown target

## Build Verification Commands

### Quick Check (Recommended)

```bash
# Frontend
cd frontend && pnpm run type-check && pnpm run lint

# Backend
cd backend && pnpm run build && pnpm run lint

# Contract
cd contract && cargo fmt --all -- --check && cargo clippy --all-targets --all-features -- -D warnings
```

### Full Build (Before Task Completion)

```bash
# Frontend
cd frontend && pnpm run build

# Backend
cd backend && pnpm run build && pnpm run test

# Contract
cd contract && ./check-all.sh
```

## Common Issues and Solutions

### TypeScript Errors

- Check import paths and module resolution
- Verify type definitions are installed
- Ensure tsconfig.json is properly configured

### Build Failures

- Clear build cache: `rm -rf .next` (frontend) or `rm -rf dist` (backend)
- Reinstall dependencies: `rm -rf node_modules && npm install`
- Check for circular dependencies

### Linting Errors

- Auto-fix when possible: `npm run lint -- --fix`
- Review eslint.config.mjs for project-specific rules
- Document intentional rule violations with inline comments

### Rust/Contract Errors

- Run `cargo fmt --all` to auto-format code
- Address all clippy warnings: `cargo clippy --all-targets --all-features -- -D warnings`
- Ensure wasm32 target is installed: `rustup target add wasm32-unknown-unknown`
- Check Cargo.toml for dependency version conflicts
- Review contract-specific documentation in `contract/docs/`

## Contract-Specific Guidelines

### Soroban Smart Contracts

The `contract/` directory contains Stellar Soroban smart contracts written in Rust. When working with contracts:

**Available Contracts:**

- `agent_registry/` - Agent registration and management
- `huston-housing/` - Main contract with emergency pause mechanism
- `dispute_resolution/` - Dispute handling with timeout mechanisms
- `escrow/` - Escrow management with timeout protection
- `payment/` - Payment processing
- `property_registry/` - Property registration
- `rent_obligation/` - Rent obligation NFTs
- `user_profile/` - User profile management

**Critical Contract Features:**

- Emergency pause mechanism (Houston Housing contract)
- Timeout mechanisms for escrow and disputes
- Event emission for monitoring
- Admin-only operations for critical functions

**Contract Development Rules:**

1. Always run `cargo fmt --all` before committing
2. Zero tolerance for clippy warnings (`-D warnings` flag)
3. All contracts must compile to wasm32-unknown-unknown
4. Test coverage is mandatory for new functions
5. Document all public contract methods
6. Follow Soroban best practices for storage and gas optimization

**Testing Contracts:**

```bash
# Run all contract tests
cd contract && cargo test

# Run tests for specific contract
cd contract && cargo test -p agent_registry

# Run tests with output
cd contract && cargo test -- --nocapture
```

**Building Contracts:**

```bash
# Build all contracts for WASM
cd contract && cargo build --target wasm32-unknown-unknown --release

# Build specific contract
cd contract && cargo build -p huston-housing --target wasm32-unknown-unknown --release

# Optimized build (if soroban-cli is installed)
cd contract && soroban contract build
```

## Tools to Use

- **getDiagnostics**: Check for errors in modified files
- **executeBash**: Run build and test commands
- **readFile**: Review configuration files when debugging
- **strReplace/editCode**: Fix identified issues

## Non-Negotiable Rules

❌ **NEVER** complete a task with:

- Unresolved syntax errors
- TypeScript compilation errors
- Rust compilation errors
- Failing builds (including WASM builds for contracts)
- Broken imports or missing dependencies
- Clippy warnings in contracts (strict mode: -D warnings)

✅ **ALWAYS** ensure:

- Code compiles successfully
- All modified files pass type checking
- Build completes without errors
- Tests pass (or are updated appropriately)

## Task Completion Checklist

Before marking any task as complete:

- [ ] All syntax errors resolved
- [ ] All type errors fixed
- [ ] Linting passes (or violations documented)
- [ ] Build succeeds for affected components
- [ ] Tests pass (if applicable)
- [ ] No console errors in development mode
- [ ] Changes are properly committed (if in git workflow)

## Emergency Procedures

If you encounter persistent build failures:

1. Document the exact error message
2. Check recent changes that might have caused the issue
3. Verify environment configuration (.env files)
4. Check for version mismatches in package.json (frontend/backend) or Cargo.toml (contracts)
5. Review recent migrations or schema changes (backend)
6. Verify Rust toolchain and wasm32 target installation (contracts)
7. Consult project documentation in `/docs` folders or `contract/docs/`

## Remember

**A task is NOT complete until the project builds successfully.**

Your responsibility is to leave the codebase in a working state, not just to implement features. Quality and stability are paramount.
