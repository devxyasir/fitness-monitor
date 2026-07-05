import type { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateReferenceVideos1751780000010 implements MigrationInterface {
  name = 'CreateReferenceVideos1751780000010';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "reference_videos" (
        "id"                   UUID         NOT NULL DEFAULT gen_random_uuid(),
        "session_id"           UUID         NOT NULL,
        "uploaded_by_user_id"  UUID         NOT NULL,
        "video_key"            VARCHAR(1024) NOT NULL,
        "keypoints_key"        VARCHAR(1024) NULL,
        "fps"                  DOUBLE PRECISION NULL,
        "frame_count"          INT          NULL,
        "width"                INT          NULL,
        "height"               INT          NULL,
        "duration_ms"          INT          NULL,
        "status"               VARCHAR(20)  NOT NULL DEFAULT 'uploading',
        "failure_reason"       TEXT         NULL,
        "created_at"           TIMESTAMPTZ  NOT NULL DEFAULT now(),
        CONSTRAINT "PK_reference_videos" PRIMARY KEY ("id"),
        CONSTRAINT "FK_reference_videos_session" FOREIGN KEY ("session_id") REFERENCES "sessions"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_reference_videos_uploader" FOREIGN KEY ("uploaded_by_user_id") REFERENCES "users"("id") ON DELETE CASCADE,
        CONSTRAINT "CK_reference_videos_status" CHECK ("status" IN ('uploading', 'processing', 'ready', 'failed'))
      )
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_reference_videos_session" ON "reference_videos" ("session_id")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "reference_videos"`);
  }
}
