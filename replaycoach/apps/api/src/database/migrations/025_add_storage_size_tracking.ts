import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Storage-stats tracking, going forward only — no historical backfill (an
 * S3 walk to compute existing files' sizes is out of scope for this pass).
 * Scoped to recordings and reference_videos only, not clips: a
 * clipType:'reference' Clip reuses a ReferenceVideo's own storage key
 * (counting it again would double-count bytes already attributed to the
 * ReferenceVideo row), and clipType:'recording' clips have no in-repo
 * byte-producing code path to hook a size measurement into.
 */
export class AddStorageSizeTracking1751780000025 implements MigrationInterface {
  name = 'AddStorageSizeTracking1751780000025';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "recordings" ADD COLUMN "size_bytes" BIGINT NULL`);
    await queryRunner.query(`ALTER TABLE "reference_videos" ADD COLUMN "size_bytes" BIGINT NULL`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "reference_videos" DROP COLUMN "size_bytes"`);
    await queryRunner.query(`ALTER TABLE "recordings" DROP COLUMN "size_bytes"`);
  }
}
