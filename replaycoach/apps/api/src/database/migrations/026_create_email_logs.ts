import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Delivery log for every outbound transactional email (org invites, org
 * messages) — one row per send attempt, including SMTP-not-configured skips
 * and failures, not just successes. Dedicated table rather than folded into
 * audit_logs for the same reason geo_access_logs is separate (see migration
 * 021): high-frequency, not an admin-initiated action, and has first-class
 * columns (kind/status/recipient) worth indexing rather than burying in a
 * jsonb metadata blob.
 */
export class CreateEmailLogs1751780000026 implements MigrationInterface {
  name = 'CreateEmailLogs1751780000026';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "email_logs" (
        "id"                    UUID         NOT NULL DEFAULT uuid_generate_v4(),
        "recipient_email"       VARCHAR(255) NOT NULL,
        "kind"                  VARCHAR(20)  NOT NULL,
        "status"                VARCHAR(20)  NOT NULL,
        "error_message"         TEXT         NULL,
        "org_id"                UUID         NULL,
        "user_id"               UUID         NULL,
        "triggered_by_user_id"  UUID         NULL,
        "created_at"            TIMESTAMPTZ  NOT NULL DEFAULT now(),
        CONSTRAINT "PK_email_logs" PRIMARY KEY ("id"),
        CONSTRAINT "FK_email_logs_org_id" FOREIGN KEY ("org_id")
          REFERENCES "organizations"("id") ON DELETE SET NULL,
        CONSTRAINT "FK_email_logs_user_id" FOREIGN KEY ("user_id")
          REFERENCES "users"("id") ON DELETE SET NULL,
        CONSTRAINT "FK_email_logs_triggered_by_user_id" FOREIGN KEY ("triggered_by_user_id")
          REFERENCES "users"("id") ON DELETE SET NULL
      )
    `);

    await queryRunner.query(`CREATE INDEX "IDX_email_logs_created_at" ON "email_logs" ("created_at")`);
    await queryRunner.query(`CREATE INDEX "IDX_email_logs_status" ON "email_logs" ("status")`);
    await queryRunner.query(`CREATE INDEX "IDX_email_logs_org_id" ON "email_logs" ("org_id")`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "email_logs"`);
  }
}
