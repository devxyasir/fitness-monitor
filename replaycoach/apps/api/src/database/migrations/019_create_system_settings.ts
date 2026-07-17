import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Platform-wide, DB-backed configuration (SMTP, brand theme colors, email
 * template copy) that a platform_admin can edit from a real settings UI
 * instead of SSH-editing .env values. Simple key/value store — one row per
 * setting group (e.g. 'smtp', 'theme', 'email_templates') rather than rigid
 * columns, so adding a new setting group never needs a migration (same
 * reasoning as Organization.settings/branding being open jsonb bags).
 *
 * env vars remain the seed/fallback (see SystemSettingsService) — a fresh
 * deployment with no DB rows yet still works from .env exactly as before;
 * saving a setting via the admin UI is what first creates a row here and
 * takes precedence from then on.
 */
export class CreateSystemSettings1751780000019 implements MigrationInterface {
  name = 'CreateSystemSettings1751780000019';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "system_settings" (
        "key"        VARCHAR(50)  NOT NULL,
        "value"      JSONB        NOT NULL,
        "updated_by" UUID         NULL,
        "updated_at" TIMESTAMPTZ  NOT NULL DEFAULT now(),
        CONSTRAINT "PK_system_settings" PRIMARY KEY ("key"),
        CONSTRAINT "FK_system_settings_updated_by" FOREIGN KEY ("updated_by")
          REFERENCES "users"("id") ON DELETE SET NULL
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "system_settings"`);
  }
}
