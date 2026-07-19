import { Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';

import { Organization } from '../organizations/organization.entity';
import { User } from '../users/user.entity';

/** One row per outbound email send attempt — see migration 026's doc
 * comment for why this is a dedicated table. */
@Entity('email_logs')
export class EmailLog {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'recipient_email', type: 'varchar', length: 255 })
  recipientEmail!: string;

  @Index()
  @Column({ type: 'varchar', length: 20 })
  kind!: 'invite' | 'org_message';

  @Index()
  @Column({ type: 'varchar', length: 20 })
  status!: 'success' | 'failure';

  @Column({ name: 'error_message', type: 'text', nullable: true })
  errorMessage!: string | null;

  @Index()
  @Column({ name: 'org_id', type: 'uuid', nullable: true })
  orgId!: string | null;

  @Column({ name: 'user_id', type: 'uuid', nullable: true })
  userId!: string | null;

  @Column({ name: 'triggered_by_user_id', type: 'uuid', nullable: true })
  triggeredByUserId!: string | null;

  @Index()
  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @ManyToOne(() => Organization, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'org_id' })
  org!: Organization | null;

  @ManyToOne(() => User, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'triggered_by_user_id' })
  triggeredBy!: User | null;
}
