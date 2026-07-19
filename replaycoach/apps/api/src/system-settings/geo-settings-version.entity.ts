import { Column, CreateDateColumn, Entity, Index, JoinColumn, ManyToOne, PrimaryGeneratedColumn } from 'typeorm';

import { User } from '../users/user.entity';

/** One row per successful geo-access settings save — see migration 027's
 * doc comment. `settings` is a full GeoAccessSettings snapshot (the
 * POST-update merged state), not a diff. */
@Entity('geo_settings_versions')
export class GeoSettingsVersion {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ type: 'jsonb' })
  settings!: Record<string, any>;

  @Column({ name: 'created_by', type: 'uuid', nullable: true })
  createdBy!: string | null;

  @Column({ type: 'varchar', length: 255, nullable: true })
  label!: string | null;

  @Index()
  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;

  @ManyToOne(() => User, { onDelete: 'SET NULL', nullable: true })
  @JoinColumn({ name: 'created_by' })
  creator!: User | null;
}
