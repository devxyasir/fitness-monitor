import { Column, Entity, PrimaryColumn, UpdateDateColumn } from 'typeorm';

export type SystemSettingKey = 'smtp' | 'theme' | 'email_templates' | 'platform';

@Entity('system_settings')
export class SystemSetting {
  @PrimaryColumn({ type: 'varchar', length: 50 })
  key!: SystemSettingKey;

  // `any` (not `unknown`) matches Organization.settings/branding's existing
  // jsonb column convention — TypeORM's recursive QueryDeepPartialEntity
  // mapped type can't resolve an index-signature object typed `unknown`.
  @Column({ type: 'jsonb' })
  value!: Record<string, any>;

  @Column({ name: 'updated_by', type: 'uuid', nullable: true })
  updatedBy!: string | null;

  @UpdateDateColumn({ name: 'updated_at' })
  updatedAt!: Date;
}
