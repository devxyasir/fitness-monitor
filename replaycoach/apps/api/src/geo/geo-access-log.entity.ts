import { Column, CreateDateColumn, Entity, Index, PrimaryGeneratedColumn } from 'typeorm';

import type { GeoDetectionMethod } from '@replaycoach/types';

/** One row per fresh geo access check — see migration 021's doc comment for
 * why this is a dedicated table rather than folded into audit_logs. */
@Entity('geo_access_logs')
export class GeoAccessLog {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'user_id', type: 'uuid', nullable: true })
  userId!: string | null;

  @Column({ type: 'varchar', length: 64 })
  ip!: string;

  @Column({ type: 'varchar', length: 100, nullable: true })
  country!: string | null;

  @Index()
  @Column({ name: 'country_code', type: 'varchar', length: 2, nullable: true })
  countryCode!: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  region!: string | null;

  @Column({ type: 'varchar', length: 100, nullable: true })
  city!: string | null;

  @Column({ name: 'detection_method', type: 'varchar', length: 10 })
  detectionMethod!: GeoDetectionMethod;

  @Index()
  @Column({ type: 'boolean' })
  allowed!: boolean;

  @Column({ type: 'varchar', length: 255, nullable: true })
  reason!: string | null;

  @Index()
  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;
}
