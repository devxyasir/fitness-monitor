import type { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateOrganizations1751579400001 implements MigrationInterface {
  name = 'CreateOrganizations1751579400001';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE "organizations" (
        "id"         UUID         NOT NULL DEFAULT gen_random_uuid(),
        "name"       VARCHAR(255) NOT NULL,
        "plan_tier"  VARCHAR(50)  NOT NULL DEFAULT 'free',
        "created_at" TIMESTAMPTZ  NOT NULL DEFAULT now(),
        CONSTRAINT "PK_organizations" PRIMARY KEY ("id")
      )
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "organizations"`);
  }
}
