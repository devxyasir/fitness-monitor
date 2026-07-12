import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * "Remember me" needs to survive token rotation: a refresh token issued from
 * a non-"remember me" login should keep expiring on its short session TTL
 * across every subsequent rotation, not silently extend to the long TTL (or
 * vice versa). Storing the choice on the row itself (rather than trusting the
 * client to keep re-sending it) means rotation can just read it off the
 * existing row and carry it forward.
 */
export class AddRememberMeToRefreshTokens1751780000015 implements MigrationInterface {
  name = 'AddRememberMeToRefreshTokens1751780000015';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE "refresh_tokens" ADD COLUMN "remember_me" BOOLEAN NOT NULL DEFAULT false`,
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE "refresh_tokens" DROP COLUMN "remember_me"`);
  }
}
