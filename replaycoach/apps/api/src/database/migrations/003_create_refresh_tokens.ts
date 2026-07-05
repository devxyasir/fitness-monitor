import type { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateRefreshTokens1751579400003 implements MigrationInterface {
  name = 'CreateRefreshTokens1751579400003';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "refresh_tokens" (
        "id"          UUID         NOT NULL DEFAULT gen_random_uuid(),
        "user_id"     UUID         NOT NULL,
        "family_id"   UUID         NOT NULL,
        "token_hash"  VARCHAR(255) NOT NULL,
        "expires_at"  TIMESTAMPTZ  NOT NULL,
        "created_at"  TIMESTAMPTZ  NOT NULL DEFAULT now(),
        CONSTRAINT "PK_refresh_tokens" PRIMARY KEY ("id"),
        CONSTRAINT "FK_refresh_tokens_user"
          FOREIGN KEY ("user_id") REFERENCES "users"("id")
          ON DELETE CASCADE
      )
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_refresh_tokens_family_id" ON "refresh_tokens" ("family_id")
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_refresh_tokens_user_id" ON "refresh_tokens" ("user_id")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "refresh_tokens"`);
  }
}
