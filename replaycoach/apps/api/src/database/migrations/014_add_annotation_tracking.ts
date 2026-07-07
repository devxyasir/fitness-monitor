import type { MigrationInterface, QueryRunner } from 'typeorm';

export class AddAnnotationTracking1751780000014 implements MigrationInterface {
  name = 'AddAnnotationTracking1751780000014';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "reference_videos"
        ADD COLUMN "analysis_mode" VARCHAR(30) NOT NULL DEFAULT 'full_body',
        ADD COLUMN "keypoint_format" VARCHAR(20) NOT NULL DEFAULT 'coco17',
        ADD COLUMN "export_video_key" VARCHAR(1024) NULL
    `);

    await queryRunner.query(`
      CREATE TABLE "tracked_annotations" (
        "id" UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        "reference_video_id" UUID NOT NULL,
        "shape_type" VARCHAR(20) NOT NULL DEFAULT 'line',
        "start_joint" VARCHAR(40) NOT NULL,
        "end_joint" VARCHAR(40) NULL,
        "mid_joint" VARCHAR(40) NULL,
        "color" VARCHAR(20) NOT NULL DEFAULT '#EF4444',
        "thickness" INT NOT NULL DEFAULT 3,
        "label" TEXT NULL,
        "from_frame" INT NOT NULL DEFAULT 0,
        "until_frame" INT NULL,
        "created_by" UUID NOT NULL,
        "created_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "FK_tracked_annotations_ref" FOREIGN KEY ("reference_video_id")
          REFERENCES "reference_videos"("id") ON DELETE CASCADE
      )
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_tracked_annotations_ref" ON "tracked_annotations" ("reference_video_id")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS "tracked_annotations"`);
    await queryRunner.query(`
      ALTER TABLE "reference_videos"
        DROP COLUMN "export_video_key",
        DROP COLUMN "keypoint_format",
        DROP COLUMN "analysis_mode"
    `);
  }
}
