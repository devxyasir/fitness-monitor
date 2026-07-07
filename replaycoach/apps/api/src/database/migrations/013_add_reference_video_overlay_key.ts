import type { MigrationInterface, QueryRunner } from 'typeorm';

export class AddReferenceVideoOverlayKey1751780000013 implements MigrationInterface {
  name = 'AddReferenceVideoOverlayKey1751780000013';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "reference_videos"
        ADD COLUMN "overlay_video_key" VARCHAR(1024) NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "reference_videos"
        DROP COLUMN "overlay_video_key"
    `);
  }
}
