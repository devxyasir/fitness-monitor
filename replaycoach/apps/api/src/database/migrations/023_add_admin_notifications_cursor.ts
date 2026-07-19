import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Backs the admin notification bell's "unread since" cursor. Lives on the
 * user row (not localStorage) so it's shared across every device/session
 * a platform_admin uses — see AdminNotificationsService.
 */
export class AddAdminNotificationsCursor1751780000023 implements MigrationInterface {
  name = 'AddAdminNotificationsCursor1751780000023';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "users"
        ADD COLUMN "admin_notifications_seen_at" TIMESTAMPTZ NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "users"
        DROP COLUMN "admin_notifications_seen_at"
    `);
  }
}
