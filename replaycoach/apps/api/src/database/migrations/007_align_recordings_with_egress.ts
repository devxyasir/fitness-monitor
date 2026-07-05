import type { MigrationInterface, QueryRunner } from 'typeorm';

export class AlignRecordingsWithEgress1751780000007 implements MigrationInterface {
  name = 'AlignRecordingsWithEgress1751780000007';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "recordings"
      ADD COLUMN IF NOT EXISTS "egress_id" VARCHAR(100)
    `);

    await queryRunner.query(`
      UPDATE "recordings"
      SET "egress_id" = 'legacy_' || "id"::text
      WHERE "egress_id" IS NULL
    `);

    await queryRunner.query(`
      ALTER TABLE "recordings"
      ALTER COLUMN "egress_id" SET NOT NULL
    `);

    await queryRunner.query(`
      ALTER TABLE "recordings"
      ALTER COLUMN "participant_id" DROP NOT NULL
    `);

    await queryRunner.query(`
      UPDATE "recordings"
      SET "participant_id" = NULL
      WHERE "track_type" = 'composite'
    `);

    await queryRunner.query(`
      UPDATE "recordings"
      SET "track_type" = 'participant'
      WHERE "track_type" = 'track'
    `);

    await queryRunner.query(`
      ALTER TABLE "recordings"
      DROP CONSTRAINT IF EXISTS "CK_recordings_track_type"
    `);

    await queryRunner.query(`
      ALTER TABLE "recordings"
      ADD CONSTRAINT "CK_recordings_track_type"
      CHECK ("track_type" IN ('participant', 'composite'))
    `);

    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "IDX_recordings_egress_id"
      ON "recordings" ("egress_id")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_recordings_egress_id"`);
    await queryRunner.query(`ALTER TABLE "recordings" DROP CONSTRAINT IF EXISTS "CK_recordings_track_type"`);
    await queryRunner.query(`UPDATE "recordings" SET "track_type" = 'track' WHERE "track_type" = 'participant'`);
    await queryRunner.query(`ALTER TABLE "recordings" ALTER COLUMN "participant_id" SET NOT NULL`);
    await queryRunner.query(`ALTER TABLE "recordings" DROP COLUMN IF EXISTS "egress_id"`);
  }
}
