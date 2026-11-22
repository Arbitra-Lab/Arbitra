# Multi-region Terraform

This directory provisions the Arbitra API in two AWS regions. It creates a VPC, private and public subnets, an ECS Fargate service behind an HTTPS load balancer, a Postgres primary with Multi AZ failover, a cross region read replica, two Redis data nodes and three Redis Sentinels per region. Route53 failover records point at the healthy regional load balancer.

## Layout

- `main.tf` calls the `region` module twice and defines Route53 failover records and health checks.
- `modules/region` contains all per region resources and startup templates.
- `variables.tf` and `outputs.tf` define inputs and exported values.
- `tests/validate-deployment.mjs` checks the topology offline.

## Usage

1. Copy `terraform.tfvars.example` to `terraform.tfvars` and fill in the domain, hosted zone, certificate and database password. Prefer a secret store over a checked in file.
2. Run `terraform init` and `terraform fmt -check -recursive`.
3. Run `pnpm validate:terraform` from the repository root. This checks two regions, database replication, DNS failover, health checks, Sentinel counts and the API Sentinel environment contract. If Terraform is initialised, native `fmt` and `validate` also run.
4. Run `terraform plan` and review the cross region replication and DNS changes before `terraform apply`.

## Failover notes

The writable database stays in the primary region. The secondary database is a read replica and must be promoted manually during a regional outage. Until promotion completes, the secondary API can serve reads and cache backed traffic but writes should be paused. Route53 health checks use `/health`, which reports `unhealthy` during process shutdown.

A live failover test requires AWS credentials and DNS changes. The offline contract checks do not replace that test. The manual runbook is in `backend/docs/deployment/MULTI_REGION_DEPLOYMENT.md`.
