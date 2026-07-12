import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Phase 2 — Users/Organizations/Teams/RBAC:
 *  - User lifecycle: status, email verification state, last login, soft delete.
 *  - Organization: settings/branding (flexible jsonb bags — no fixed schema
 *    for either yet, so no rigid columns to migrate again per new setting),
 *    creator reference (previously accepted by the service and discarded).
 *  - Teams: new — org-scoped groups with membership + a per-team role.
 *  - org_invites: optional team scoping, fast token lookup, revoke-safe
 *    unique constraint (a token is the entire security boundary for
 *    redemption, so a duplicate would let one invite redeem another's slot).
 */
export class AddUsersOrgsTeamsInvites1751780000016 implements MigrationInterface {
  name = 'AddUsersOrgsTeamsInvites1751780000016';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "users"
        ADD COLUMN "status" VARCHAR(20) NOT NULL DEFAULT 'active',
        ADD COLUMN "email_verified" BOOLEAN NOT NULL DEFAULT false,
        ADD COLUMN "email_verified_at" TIMESTAMPTZ NULL,
        ADD COLUMN "last_login_at" TIMESTAMPTZ NULL,
        ADD COLUMN "deleted_at" TIMESTAMPTZ NULL
    `);
    await queryRunner.query(`CREATE INDEX "IDX_users_deleted_at" ON "users" ("deleted_at")`);
    await queryRunner.query(`CREATE INDEX "IDX_users_org_id" ON "users" ("org_id")`);

    await queryRunner.query(`
      ALTER TABLE "organizations"
        ADD COLUMN "settings" JSONB NOT NULL DEFAULT '{}',
        ADD COLUMN "branding" JSONB NOT NULL DEFAULT '{}',
        ADD COLUMN "created_by" UUID NULL,
        ADD CONSTRAINT "FK_organizations_created_by" FOREIGN KEY ("created_by")
          REFERENCES "users"("id") ON DELETE SET NULL
    `);

    await queryRunner.query(`
      CREATE TABLE "teams" (
        "id"         UUID         NOT NULL DEFAULT gen_random_uuid(),
        "org_id"     UUID         NOT NULL,
        "name"       VARCHAR(255) NOT NULL,
        "created_by" UUID         NULL,
        "created_at" TIMESTAMPTZ  NOT NULL DEFAULT now(),
        CONSTRAINT "PK_teams" PRIMARY KEY ("id"),
        CONSTRAINT "FK_teams_org" FOREIGN KEY ("org_id")
          REFERENCES "organizations"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_teams_created_by" FOREIGN KEY ("created_by")
          REFERENCES "users"("id") ON DELETE SET NULL
      )
    `);
    await queryRunner.query(`CREATE INDEX "IDX_teams_org_id" ON "teams" ("org_id")`);

    await queryRunner.query(`
      CREATE TABLE "team_members" (
        "id"        UUID        NOT NULL DEFAULT gen_random_uuid(),
        "team_id"   UUID        NOT NULL,
        "user_id"   UUID        NOT NULL,
        "role"      VARCHAR(20) NOT NULL DEFAULT 'member',
        "joined_at" TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "PK_team_members" PRIMARY KEY ("id"),
        CONSTRAINT "FK_team_members_team" FOREIGN KEY ("team_id")
          REFERENCES "teams"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_team_members_user" FOREIGN KEY ("user_id")
          REFERENCES "users"("id") ON DELETE CASCADE,
        CONSTRAINT "UQ_team_members_team_user" UNIQUE ("team_id", "user_id")
      )
    `);
    await queryRunner.query(`CREATE INDEX "IDX_team_members_user_id" ON "team_members" ("user_id")`);

    await queryRunner.query(`
      ALTER TABLE "org_invites"
        ADD COLUMN "team_id" UUID NULL,
        ADD CONSTRAINT "FK_org_invites_team" FOREIGN KEY ("team_id")
          REFERENCES "teams"("id") ON DELETE SET NULL
    `);
    await queryRunner.query(`CREATE UNIQUE INDEX "IDX_org_invites_token" ON "org_invites" ("invite_token")`);
    await queryRunner.query(`CREATE INDEX "IDX_org_invites_email" ON "org_invites" ("invited_email")`);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX "IDX_org_invites_email"`);
    await queryRunner.query(`DROP INDEX "IDX_org_invites_token"`);
    await queryRunner.query(`
      ALTER TABLE "org_invites"
        DROP CONSTRAINT "FK_org_invites_team",
        DROP COLUMN "team_id"
    `);

    await queryRunner.query(`DROP TABLE "team_members"`);
    await queryRunner.query(`DROP TABLE "teams"`);

    await queryRunner.query(`
      ALTER TABLE "organizations"
        DROP CONSTRAINT "FK_organizations_created_by",
        DROP COLUMN "created_by",
        DROP COLUMN "branding",
        DROP COLUMN "settings"
    `);

    await queryRunner.query(`DROP INDEX "IDX_users_org_id"`);
    await queryRunner.query(`DROP INDEX "IDX_users_deleted_at"`);
    await queryRunner.query(`
      ALTER TABLE "users"
        DROP COLUMN "deleted_at",
        DROP COLUMN "last_login_at",
        DROP COLUMN "email_verified_at",
        DROP COLUMN "email_verified",
        DROP COLUMN "status"
    `);
  }
}
