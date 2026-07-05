import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';

import { Organization } from './organization.entity';

@Entity('org_invites')
export class OrgInvite {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'org_id' })
  orgId!: string;

  @Column({ name: 'invited_email', type: 'varchar', length: 255 })
  invitedEmail!: string;

  @Column({ type: 'varchar', length: 50 })
  role!: string;

  @Column({ name: 'invite_token', type: 'varchar', length: 255 })
  inviteToken!: string;

  @Column({ name: 'invited_by' })
  invitedBy!: string;

  @Column({ name: 'expires_at', type: 'timestamptz' })
  expiresAt!: Date;

  @Column({ name: 'used_at', type: 'timestamptz', nullable: true })
  usedAt!: Date | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @ManyToOne(() => Organization, (org) => org.invites)
  @JoinColumn({ name: 'org_id' })
  organization!: Organization;
}
