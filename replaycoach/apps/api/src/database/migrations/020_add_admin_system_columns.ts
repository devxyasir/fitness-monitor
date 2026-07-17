import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Columns needed for the Phase 1 admin system rebuild:
 *
 *  - organizations.status: platform_admin can suspend an org (a flag org
 *    admins/coaches see a banner for — this phase deliberately does not
 *    cascade into locking out members' own sessions, since nothing
 *    currently reads that consequence chain).
 *  - users.totp_*: optional, self-service TOTP 2FA for platform_admin
 *    accounts. Nullable/default-off — never mandatory-on-login, so nobody
 *    without an authenticator app handy gets locked out.
 *  - users.last_login_ip: captured at login (apps/api/src/auth/auth.service.ts),
 *    surfaced on the new admin security panel and written into audit-log
 *    entries — previously captured nowhere at all.
 */
export class AddAdminSystemColumns1751780000020 implements MigrationInterface {
  name = 'AddAdminSystemColumns1751780000020';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "organizations"
        ADD COLUMN "status" VARCHAR(20) NOT NULL DEFAULT 'active'
    `);

    await queryRunner.query(`
      ALTER TABLE "users"
        ADD COLUMN "totp_secret" VARCHAR(255) NULL,
        ADD COLUMN "totp_enabled" BOOLEAN NOT NULL DEFAULT false,
        ADD COLUMN "totp_backup_codes" JSONB NULL,
        ADD COLUMN "last_login_ip" INET NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "users"
        DROP COLUMN "last_login_ip",
        DROP COLUMN "totp_backup_codes",
        DROP COLUMN "totp_enabled",
        DROP COLUMN "totp_secret"
    `);

    await queryRunner.query(`
      ALTER TABLE "organizations"
        DROP COLUMN "status"
    `);
  }
}
