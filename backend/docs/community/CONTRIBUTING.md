````markdown
# Contributing to Houston Housing

This document outlines the contribution process for the Houston Housing platform. We welcome community contributions that advance our mission of making rental payments transparent, low-cost, and programmable.

## Table of Contents

- [Introduction](#introduction)
- [Prerequisites](#prerequisites)
- [Getting Started](#getting-started)
- [Development Workflow](#development-workflow)
  - [Backend (NestJS)](#backend-nestjs)
  - [Frontend (Next.js)](#frontend-nextjs)
  - [Smart Contracts (Soroban)](#smart-contracts-soroban)
- [Code Style](#code-style)
- [Pull Request Process](#pull-request-process)

## Introduction

Houston Housing is an open-source platform built on the Stellar blockchain, connecting landlords, agents, and tenants through a hybrid architecture that combines on-chain settlement with off-chain business logic.

## Prerequisites

Ensure you have the following installed:

- **Node.js** (v20+ recommended)
- **pnpm** (v9+ recommended)
- **Rust** (latest stable)
- **Soroban CLI** (latest version compatible with Stellar network)
- **Docker** (optional, for running local databases)

## Getting Started

1.  **Clone the repository**:

    ```bash
    git clone https://github.com/caxtonacollins/huston-housing.git
    cd huston-housing
    ```

2.  **Install dependencies**:
    Navigate to the backend and frontend directories and run:

    ```bash
    cd backend && pnpm install
    cd ../frontend && pnpm install
    ```

3.  **Set up Environment Variables**:
    - **Backend**: Copy `.env.example` to `.env` in `backend/` and configure your database and Stellar credentials.
    - **Frontend**: Copy `.env.example` (if available) or create `.env.local` in `frontend/` with necessary API endpoints.

## Development Workflow

### Backend (NestJS)

Located in `backend/`.

- **Run in development mode**:
  ```bash
  cd backend
  pnpm start:dev
  ```
- **Run tests**:
  ```bash
  pnpm test
  ```
- **Lint code**:
  ```bash
  pnpm lint
  ```

### Frontend (Next.js)

Located in `frontend/`.

- **Run in development mode**:
  ```bash
  cd frontend
  pnpm dev
  ```
- **Build for production**:
  ```bash
  pnpm build
  ```
- **Lint code**:
  ```bash
  pnpm lint
  ```

### Smart Contracts (Soroban)

Located in `contract/`.

- **Build contracts**:
  ```bash
  cd contract
  cargo build
  ```
- **Run tests**:
  ```bash
  cargo test
  ```
- **Format code**:
  ```bash
  cargo fmt
  ```

## Code Style

- **JavaScript/TypeScript**: We use **Prettier** and **ESLint**. Run `pnpm format` or `pnpm lint` before committing.
- **Rust**: We use **Rustfmt**. Run `cargo fmt` before committing.

## Pull Request Process

1. Fork the repository and create a feature branch for your changes
2. Ensure all tests pass locally before submission
3. Submit a pull request with a comprehensive description of your changes
4. Reference any related issues in your pull request description
5. Address reviewer feedback promptly and professionally

We appreciate your contributions to the Houston Housing platform.

## Local Pipeline Validation

You can execute the same validation checks used by our CI/CD pipeline locally before submitting a pull request. Each component includes a `check-all.sh` script that performs formatting, linting, building, and testing.

- Frontend: Execute from the repository root or the `frontend` directory:
  - Script location: [frontend/check-all.sh](frontend/check-all.sh)

  ```bash
  ./frontend/check-all.sh
  ```

- Backend: Execute from the repository root or the `backend` directory:
  - Script location: [backend/check-all.sh](backend/check-all.sh)

  ```bash
  ./backend/check-all.sh
  ```

- Contracts: Execute from the repository root or the `contract` directory:
  - Script location: [contract/check-all.sh](contract/check-all.sh)

  ```bash
  ./contract/check-all.sh
  ```

Each script terminates immediately upon encountering an error (`set -e`), ensuring that any failing step halts execution and returns a non-zero exit code. Use these scripts to validate your changes locally and minimize CI/CD iteration cycles.
````
