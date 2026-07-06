import type { MigrationInterface, QueryRunner } from 'typeorm';

export class AddClipTypeReferenceVideo1751780000011 implements MigrationInterface {
  name = 'AddClipTypeReferenceVideo1751780000011';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "clips"
        ADD COLUMN "clip_type" VARCHAR(20) NOT NULL DEFAULT 'recording',
        ADD COLUMN "reference_video_id" UUID NULL,
        ADD CONSTRAINT "FK_clips_reference_video" FOREIGN KEY ("reference_video_id")
          REFERENCES "reference_videos"("id") ON DELETE SET NULL,
        ADD CONSTRAINT "CK_clips_clip_type" CHECK ("clip_type" IN ('recording', 'reference'))
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "clips"
        DROP CONSTRAINT "CK_clips_clip_type",
        DROP CONSTRAINT "FK_clips_reference_video",
        DROP COLUMN "reference_video_id",
        DROP COLUMN "clip_type"
    `);
  }
}
