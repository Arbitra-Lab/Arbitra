import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  Index,
} from 'typeorm';

/** One row per template render used in a real agreement (#13 analytics). */
@Entity('template_usages')
@Index('IDX_template_usages_template', ['templateId'])
export class TemplateUsage {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'template_id' })
  templateId: string;

  @Column({ name: 'template_version', type: 'int', default: 1 })
  templateVersion: number;

  @Column({ name: 'user_id', nullable: true })
  userId: string | null;

  @Column({ name: 'agreement_id', nullable: true })
  agreementId: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt: Date;
}
