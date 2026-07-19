import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Admin content oversight: an orthogonal "hidden" flag on sessions and
 * clips, not a new status-machine state — Session.status's transition
 * matrix (scheduled -> live -> ended -> processed -> archived) stays
 * untouched. A hidden session/clip is blocked from normal (non-admin)
 * access at the guard/service level (see SessionsGuard, ClipsService's
 * assertClipAccess) while remaining fully visible to platform_admin.
 */
export class AddContentModerationColumns1751780000024 implements MigrationInterface {
  name = 'AddContentModerationColumns1751780000024';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "sessions"
        ADD COLUMN "hidden" BOOLEAN NOT NULL DEFAULT false,
        ADD COLUMN "hidden_reason" VARCHAR(255) NULL,
        ADD COLUMN "hidden_by" UUID NULL REFERENCES "users"("id") ON DELETE SET NULL,
        ADD COLUMN "hidden_at" TIMESTAMPTZ NULL
    `);
    await queryRunner.query(`
      ALTER TABLE "clips"
        ADD COLUMN "hidden" BOOLEAN NOT NULL DEFAULT false,
        ADD COLUMN "hidden_reason" VARCHAR(255) NULL,
        ADD COLUMN "hidden_by" UUID NULL REFERENCES "users"("id") ON DELETE SET NULL,
        ADD COLUMN "hidden_at" TIMESTAMPTZ NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "clips"
        DROP COLUMN "hidden",
        DROP COLUMN "hidden_reason",
        DROP COLUMN "hidden_by",
        DROP COLUMN "hidden_at"
    `);
    await queryRunner.query(`
      ALTER TABLE "sessions"
        DROP COLUMN "hidden",
        DROP COLUMN "hidden_reason",
        DROP COLUMN "hidden_by",
        DROP COLUMN "hidden_at"
    `);
  }
}
