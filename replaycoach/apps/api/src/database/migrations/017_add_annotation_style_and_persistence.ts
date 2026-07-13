import type { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Phase 3 — live in-meeting annotation improvements:
 *  - `color`/`thickness` were only ever broadcast live (socket payload), never
 *    persisted — a late-joining participant or a page reload lost the actual
 *    drawn color/width and fell back to a hardcoded default. Now stored.
 *  - `persist_until_cleared`: previously every annotation was visible on
 *    exactly one millisecond of the replay timeline (`frameTimestampMs`) and
 *    nowhere else — fine for a momentary telestrator mark (pen/text), wrong
 *    for a joint-attached shape that's meant to track the body across the
 *    whole replay window. Default `false` preserves the exact existing
 *    behavior for every past and future momentary annotation.
 */
export class AddAnnotationStyleAndPersistence1751780000017 implements MigrationInterface {
  name = 'AddAnnotationStyleAndPersistence1751780000017';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "annotations"
        ADD COLUMN "color" VARCHAR(20) NULL,
        ADD COLUMN "thickness" INT NOT NULL DEFAULT 3,
        ADD COLUMN "persist_until_cleared" BOOLEAN NOT NULL DEFAULT false
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "annotations"
        DROP COLUMN "persist_until_cleared",
        DROP COLUMN "thickness",
        DROP COLUMN "color"
    `);
  }
}
