import type { MigrationInterface, QueryRunner } from 'typeorm';

export class AddRefreshTokenRotatedAt1751780000008 implements MigrationInterface {
  name = 'AddRefreshTokenRotatedAt1751780000008';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "refresh_tokens"
      ADD COLUMN IF NOT EXISTS "rotated_at" TIMESTAMPTZ
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_refresh_tokens_rotated_at"
      ON "refresh_tokens" ("rotated_at")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_refresh_tokens_rotated_at"`);
    await queryRunner.query(`ALTER TABLE "refresh_tokens" DROP COLUMN IF EXISTS "rotated_at"`);
  }
}
