import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  OneToMany,
  Index,
} from 'typeorm';
import { TemplateClause } from './template-clause.entity';

export enum TemplateStatus {
  DRAFT = 'DRAFT',
  PENDING_REVIEW = 'PENDING_REVIEW',
  APPROVED = 'APPROVED',
  REJECTED = 'REJECTED',
  ARCHIVED = 'ARCHIVED',
}

@Entity('agreement_templates')
@Index('IDX_agreement_templates_slug_version', ['slug', 'version'])
@Index('IDX_agreement_templates_status_language', ['status', 'language'])
export class AgreementTemplate {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  /** Stable identifier grouping all versions/languages of one template. */
  @Column()
  slug: string;

  @Column()
  name: string;

  @Column({ type: 'text' })
  baseContent: string;

  @Column()
  jurisdiction: string;

  /** ISO 639-1 language code, e.g. en, fr. */
  @Column({ default: 'en' })
  language: string;

  /** Template family, e.g. rental, freelance, trade, insurance. */
  @Column({ default: 'rental' })
  category: string;

  @Column({ type: 'int', default: 1 })
  version: number;

  @Column({
    type: 'enum',
    enum: TemplateStatus,
    default: TemplateStatus.DRAFT,
  })
  status: TemplateStatus;

  /** Eligible to appear in the agreement template marketplace. */
  @Column({ name: 'is_public', default: false })
  isPublic: boolean;

  @Column({ name: 'usage_count', type: 'int', default: 0 })
  usageCount: number;

  @Column({ name: 'approved_by', nullable: true })
  approvedBy: string | null;

  @Column({ name: 'approved_at', type: 'datetime', nullable: true })
  approvedAt: Date | null;

  @Column({ name: 'rejection_reason', type: 'text', nullable: true })
  rejectionReason: string | null;

  @Column({ type: 'simple-json', default: () => "'[]'" })
  tags: string[];

  @Column({ default: true })
  isActive: boolean;

  @OneToMany(() => TemplateClause, (clause) => clause.template, {
    cascade: true,
  })
  clauses: TemplateClause[];

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
