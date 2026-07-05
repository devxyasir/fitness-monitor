import type { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateOrgInvites1751579400004 implements MigrationInterface {
  name = 'CreateOrgInvites1751579400004';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "org_invites" (
        "id"            UUID         NOT NULL DEFAULT gen_random_uuid(),
        "org_id"        UUID         NOT NULL,
        "invited_email" VARCHAR(255) NOT NULL,
        "role"          VARCHAR(50)  NOT NULL DEFAULT 'coach',
        "invite_token"  VARCHAR(255) NOT NULL,
        "invited_by"    UUID         NOT NULL,
        "expires_at"    TIMESTAMPTZ  NOT NULL,
        "used_at"       TIMESTAMPTZ  NULL,
        "created_at"    TIMESTAMPTZ  NOT NULL DEFAULT now(),
        CONSTRAINT "PK_org_invites" PRIMARY KEY ("id"),
        CONSTRAINT "FK_org_invites_org"
          FOREIGN KEY ("org_id") REFERENCES "organizations"("id")
          ON DELETE CASCADE,
        CONSTRAINT "FK_org_invites_inviter"
          FOREIGN KEY ("invited_by") REFERENCES "users"("id")
          ON DELETE CASCADE
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "org_invites"`);
  }
}
