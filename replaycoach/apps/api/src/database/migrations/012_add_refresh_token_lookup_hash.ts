import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * findValid()/findRotatedMatch() previously did a full scan of every
 * active/rotated row, running an argon2id verify (deliberately slow) against
 * EACH one until a match was found. With the table's natural growth (one row
 * added per login/rotation, no compaction until the 7-day TTL), this became
 * an O(n) sequential-argon2-verify per refresh call — confirmed taking
 * 20-45s with ~96 accumulated rows, which silently exceeds the frontend's
 * 5s refresh timeout and looks exactly like "randomly logged out".
 *
 * Fix: add a fast, indexed SHA-256 lookup hash so the matching row is found
 * in O(1), then argon2-verify only that ONE row (unchanged security
 * property — argon2 is still the actual proof-of-possession check; SHA-256
 * is only used as a non-secret DB index, which is safe for a
 * high-entropy random token, unlike a password).
 */
export class AddRefreshTokenLookupHash1751780000012 implements MigrationInterface {
  name = 'AddRefreshTokenLookupHash1751780000012';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "refresh_tokens" ADD COLUMN "token_lookup_hash" VARCHAR(64)`);

    // Existing rows predate this column and can't be retroactively hashed
    // (we never stored the raw token) — backfill with their own id so the
    // NOT NULL + UNIQUE constraints below are satisfiable. These rows simply
    // become unmatchable by any future lookup (equivalent to being logged
    // out once), which only affects already-abandoned dev/test sessions.
    await queryRunner.query(`UPDATE "refresh_tokens" SET "token_lookup_hash" = "id"::text WHERE "token_lookup_hash" IS NULL`);

    await queryRunner.query(`ALTER TABLE "refresh_tokens" ALTER COLUMN "token_lookup_hash" SET NOT NULL`);
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_refresh_tokens_lookup_hash" ON "refresh_tokens" ("token_lookup_hash")`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "IDX_refresh_tokens_lookup_hash"`);
    await queryRunner.query(`ALTER TABLE "refresh_tokens" DROP COLUMN "token_lookup_hash"`);
  }
}
