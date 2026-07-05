import type { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateUsers1751579400002 implements MigrationInterface {
  name = 'CreateUsers1751579400002';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TYPE "user_role" AS ENUM (
        'platform_admin', 'studio_admin', 'coach', 'student'
      )
    `);

    await queryRunner.query(`
      CREATE TABLE "users" (
        "id"              UUID         NOT NULL DEFAULT gen_random_uuid(),
        "email"           VARCHAR(255) NOT NULL,
        "password_hash"   VARCHAR(255) NOT NULL,
        "role"            "user_role"  NOT NULL DEFAULT 'student',
        "org_id"          UUID         NULL,
        "display_name"    VARCHAR(255) NOT NULL,
        "avatar_url"      VARCHAR(512) NULL,
        "session_version" INTEGER      NOT NULL DEFAULT 1,
        "created_at"      TIMESTAMPTZ  NOT NULL DEFAULT now(),
        CONSTRAINT "PK_users" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_users_email" UNIQUE ("email"),
        CONSTRAINT "FK_users_org"
          FOREIGN KEY ("org_id") REFERENCES "organizations"("id")
          ON DELETE SET NULL
      )
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_users_email" ON "users" ("email")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "users"`);
    await queryRunner.query(`DROP TYPE "user_role"`);
  }
}
