import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Security & performance — add missing indexes for filtered queries:
 *  - org_invites.org_id: queried when listing/finding invites by org.
 *  - annotations.created_by: queried in the undo-last-annotation flow.
 *  - clip_shares.shared_with_user_id: the trailing column of the composite
 *    unique index (IDX_clip_shares_clip_user) cannot serve a
 *    shared_with_user_id-only query (student "clips shared with me").
 */
export class AddMissingIndexes1751780000018 implements MigrationInterface {
  name = 'AddMissingIndexes1751780000018';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_org_invites_org_id"
      ON "org_invites" ("org_id")
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_annotations_created_by"
      ON "annotations" ("created_by")
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_clip_shares_shared_with_user_id"
      ON "clip_shares" ("shared_with_user_id")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_clip_shares_shared_with_user_id"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_annotations_created_by"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_org_invites_org_id"`);
  }
}
