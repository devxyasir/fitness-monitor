import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Export-job status tracking on ReferenceVideo — sibling columns, not a
 * separate table, matching the entity's existing single-current-status
 * convention (status/failure_reason) for the analogous upload/keypoints
 * pipeline. Export is 1:1-per-video (re-exporting overwrites the previous
 * job's status) and nothing reads export history, so a joined table would
 * be inconsistent with how this entity already models the same shape.
 */
export class AddReferenceExportStatus1751780000022 implements MigrationInterface {
  name = 'AddReferenceExportStatus1751780000022';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "reference_videos"
        ADD COLUMN "export_status" VARCHAR(20) NOT NULL DEFAULT 'idle',
        ADD COLUMN "export_progress_percent" INT NULL,
        ADD COLUMN "export_job_id" VARCHAR(64) NULL,
        ADD COLUMN "export_error_message" TEXT NULL,
        ADD COLUMN "export_requested_at" TIMESTAMPTZ NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "reference_videos"
        DROP COLUMN "export_status",
        DROP COLUMN "export_progress_percent",
        DROP COLUMN "export_job_id",
        DROP COLUMN "export_error_message",
        DROP COLUMN "export_requested_at"
    `);
  }
}
