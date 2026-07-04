#!/bin/bash

# Production Database Seeding Script
# This script seeds the production database with demo users

set -e

echo "=========================================="
echo "Production Database Seeding"
echo "=========================================="
echo ""

# Check if DATABASE_URL is set
if [ -z "$DATABASE_URL" ]; then
  echo "Error: DATABASE_URL environment variable is not set"
  exit 1
fi

echo "Step 1: Running migrations..."
pnpm migration:run
echo "✓ Migrations completed"
echo ""

echo "Step 2: Seeding demo users..."
echo ""

# Seed Admin
echo "Creating Admin user..."
NODE_ENV=production ts-node src/commands/index.ts admin \
  --email "admin@huston-housing.demo" \
  --password "Admin@Demo2024!" \
  --first-name "System" \
  --last-name "Administrator" \
  --force

echo ""

# Seed Agent
echo "Creating Agent user..."
NODE_ENV=production ts-node src/commands/index.ts agent \
  --email "agent@huston-housing.demo" \
  --password "Agent@Demo2024!" \
  --first-name "Demo" \
  --last-name "Agent" \
  --force

echo ""

# Seed Landlord
echo "Creating Landlord user..."
NODE_ENV=production ts-node src/commands/index.ts landlord \
  --email "landlord@huston-housing.demo" \
  --password "Landlord@Demo2024!" \
  --first-name "Demo" \
  --last-name "Landlord" \
  --force

echo ""

# Seed Tenant
echo "Creating Tenant user..."
NODE_ENV=production ts-node src/commands/index.ts tenant \
  --email "tenant@huston-housing.demo" \
  --password "Tenant@Demo2024!" \
  --first-name "Demo" \
  --last-name "Tenant" \
  --force

echo ""
echo "=========================================="
echo "✓ Production seeding completed!"
echo "=========================================="
echo ""
echo "Demo Credentials:"
echo "----------------"
echo "Admin:    admin@huston-housing.demo / Admin@Demo2024!"
echo "Agent:    agent@huston-housing.demo / Agent@Demo2024!"
echo "Landlord: landlord@huston-housing.demo / Landlord@Demo2024!"
echo "Tenant:   tenant@huston-housing.demo / Tenant@Demo2024!"
echo ""
