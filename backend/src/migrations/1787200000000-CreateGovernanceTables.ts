import { MigrationInterface, QueryRunner } from 'typeorm';

/** DB-backed protocol governance tables for #24. */
export class CreateGovernanceTables1787200000000 implements MigrationInterface {
  name = 'CreateGovernanceTables1787200000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `CREATE TABLE IF NOT EXISTS "governance_proposals" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "type" character varying(50) NOT NULL,
        "title" character varying(200) NOT NULL,
        "description" text NOT NULL,
        "proposer_id" uuid NOT NULL,
        "parameters" jsonb,
        "status" character varying(30) NOT NULL DEFAULT 'ACTIVE',
        "quorum_bps" integer NOT NULL DEFAULT 1000,
        "threshold_bps" integer NOT NULL DEFAULT 5000,
        "for_weight" numeric(20,2) NOT NULL DEFAULT 0,
        "against_weight" numeric(20,2) NOT NULL DEFAULT 0,
        "abstain_weight" numeric(20,2) NOT NULL DEFAULT 0,
        "voter_count" integer NOT NULL DEFAULT 0,
        "voting_ends_at" TIMESTAMP NOT NULL,
        "executed_at" TIMESTAMP,
        "execution_notes" text,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_governance_proposals_id" PRIMARY KEY ("id")
      )`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_governance_proposals_status" ON "governance_proposals" ("status")`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_governance_proposals_type" ON "governance_proposals" ("type")`,
    );

    await queryRunner.query(
      `CREATE TABLE IF NOT EXISTS "governance_votes" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "proposal_id" uuid NOT NULL,
        "voter_id" uuid NOT NULL,
        "choice" character varying(20) NOT NULL,
        "weight_snapshot" numeric(20,2) NOT NULL,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_governance_votes_id" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_governance_votes_proposal_voter" UNIQUE ("proposal_id", "voter_id")
      )`,
    );
    await queryRunner.query(
      `CREATE INDEX IF NOT EXISTS "IDX_governance_votes_proposal" ON "governance_votes" ("proposal_id")`,
    );

    await queryRunner.query(
      `CREATE TABLE IF NOT EXISTS "governance_token_balances" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "user_id" uuid NOT NULL,
        "balance" numeric(20,2) NOT NULL DEFAULT 0,
        "locked_balance" numeric(20,2) NOT NULL DEFAULT 0,
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_governance_token_balances_id" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_governance_token_balances_user" UNIQUE ("user_id")
      )`,
    );

    await queryRunner.query(
      `CREATE TABLE IF NOT EXISTS "governance_token_distributions" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "user_id" uuid NOT NULL,
        "amount" numeric(20,2) NOT NULL,
        "idempotency_key" character varying(120) NOT NULL,
        "source" character varying(80) NOT NULL,
        "created_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_governance_token_distributions_id" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_governance_token_distributions_key" UNIQUE ("idempotency_key")
      )`,
    );

    await queryRunner.query(
      `CREATE TABLE IF NOT EXISTS "governance_parameters" (
        "key" character varying(80) NOT NULL,
        "value" jsonb NOT NULL,
        "updated_at" TIMESTAMP NOT NULL DEFAULT now(),
        CONSTRAINT "PK_governance_parameters_key" PRIMARY KEY ("key")
      )`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    for (const table of [
      'governance_parameters',
      'governance_token_distributions',
      'governance_token_balances',
      'governance_votes',
      'governance_proposals',
    ]) {
      await queryRunner.query(`DROP TABLE IF EXISTS "${table}"`);
    }
  }
}
