import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Backing table for the Geo Access Control system's decision log — one row
 * per fresh geo check (POST /geo/check), not per request; the lookup
 * service caches per-IP for ~1h so a repeat visitor doesn't produce a flood
 * of rows. Deliberately a dedicated table rather than folded into
 * audit_logs: that table's actorUserId/action/resourceType shape fits admin
 * actions, not high-frequency anonymous-visitor traffic, and has no
 * first-class country/city/detection-method/allowed columns to filter or
 * index on — everything geo-specific would otherwise live unindexed inside
 * its metadata jsonb.
 */
export class CreateGeoAccessLogs1751780000021 implements MigrationInterface {
  name = 'CreateGeoAccessLogs1751780000021';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "geo_access_logs" (
        "id"               UUID         NOT NULL DEFAULT uuid_generate_v4(),
        "user_id"          UUID         NULL,
        "ip"               VARCHAR(64)  NOT NULL,
        "country"          VARCHAR(100) NULL,
        "country_code"     VARCHAR(2)   NULL,
        "region"           VARCHAR(100) NULL,
        "city"             VARCHAR(100) NULL,
        "detection_method" VARCHAR(10)  NOT NULL,
        "allowed"          BOOLEAN      NOT NULL,
        "reason"           VARCHAR(255) NULL,
        "created_at"       TIMESTAMPTZ  NOT NULL DEFAULT now(),
        CONSTRAINT "PK_geo_access_logs" PRIMARY KEY ("id"),
        CONSTRAINT "FK_geo_access_logs_user_id" FOREIGN KEY ("user_id")
          REFERENCES "users"("id") ON DELETE SET NULL
      )
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_geo_access_logs_created_at" ON "geo_access_logs" ("created_at")
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_geo_access_logs_allowed" ON "geo_access_logs" ("allowed")
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_geo_access_logs_country_code" ON "geo_access_logs" ("country_code")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "geo_access_logs"`);
  }
}
