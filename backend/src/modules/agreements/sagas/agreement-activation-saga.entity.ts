import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';
import {
  ActivationSagaContext,
  SagaStatus,
  SagaStepRecord,
} from './agreement-activation-saga.types';

/**
 * Durable record of an agreement-activation saga run. One row per attempt;
 * `steps` and `context` are updated (and persisted) after every individual
 * step so that a crash mid-saga can be resumed or compensated from exactly
 * where it left off, rather than from scratch.
 *
 * `steps`/`context` use `simple-json` (stored as text) rather than `jsonb`
 * so the same entity works unmodified against both Postgres (production)
 * and SQLite (in-memory integration tests).
 */
@Entity('agreement_activation_sagas')
@Index(['agreementId'])
@Index(['status'])
export class AgreementActivationSaga {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'agreement_id' })
  agreementId: string;

  @Column({
    name: 'status',
    type: 'varchar',
    length: 30,
    default: SagaStatus.PENDING,
  })
  status: SagaStatus;

  @Column({
    name: 'previous_agreement_status',
    type: 'varchar',
    length: 50,
    nullable: true,
  })
  previousAgreementStatus: string | null;

  @Column({ name: 'steps', type: 'simple-json' })
  steps: SagaStepRecord[];

  @Column({ name: 'context', type: 'simple-json', nullable: true })
  context: ActivationSagaContext;

  @Column({ name: 'failure_reason', type: 'text', nullable: true })
  failureReason: string | null;

  @Column({ name: 'completed_at', type: 'timestamp', nullable: true })
  completedAt: Date | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt: Date;
}
