import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Config rollback for Geo Access Control settings — snapshots the
 * POST-update merged state on every successful save (see
 * SystemSettingsService#updateGeoAccess), so the newest row always equals
 * the live config and "restore any past version" doubles as "duplicate"
 * with no separate concept needed. No retention cap on rows — settings
 * changes are a rare admin action, not high-frequency, so unbounded growth
 * here isn't a real concern.
 */
export class CreateGeoSettingsVersions1751780000027 implements MigrationInterface {
  name = 'CreateGeoSettingsVersions1751780000027';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "geo_settings_versions" (
        "id"         UUID         NOT NULL DEFAULT uuid_generate_v4(),
        "settings"   JSONB        NOT NULL,
        "created_by" UUID         NULL,
        "label"      VARCHAR(255) NULL,
        "created_at" TIMESTAMPTZ  NOT NULL DEFAULT now(),
        CONSTRAINT "PK_geo_settings_versions" PRIMARY KEY ("id"),
        CONSTRAINT "FK_geo_settings_versions_created_by" FOREIGN KEY ("created_by")
          REFERENCES "users"("id") ON DELETE SET NULL
      )
    `);

    await queryRunner.query(`CREATE INDEX "IDX_geo_settings_versions_created_at" ON "geo_settings_versions" ("created_at")`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "geo_settings_versions"`);
  }
}
