import {
  Column,
  CreateDateColumn,
  Entity,
  OneToMany,
  PrimaryGeneratedColumn,
} from 'typeorm';

import { User } from '../users/user.entity';
import { OrgInvite } from './org-invite.entity';

@Entity('organizations')
export class Organization {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'varchar', length: 255 })
  name!: string;

  @Column({ type: 'varchar', length: 50, default: 'free', name: 'plan_tier' })
  planTier!: string;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @OneToMany(() => User, (user) => user.organization)
  users!: User[];

  @OneToMany(() => OrgInvite, (invite) => invite.organization)
  invites!: OrgInvite[];
}
