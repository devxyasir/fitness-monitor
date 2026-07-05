import type { MigrationInterface, QueryRunner } from 'typeorm';

export class AddPerfIndexes1751780000009 implements MigrationInterface {
  name = 'AddPerfIndexes1751780000009';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // Replay overlay reads annotations by replay event.
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_annotations_replay_event_id"
      ON "annotations" ("replay_event_id")
    `);

    // Clip overlay reads annotations by clip + frame position.
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_annotations_clip_frame"
      ON "annotations" ("clip_id", "frame_timestamp_ms")
    `);

    // Every clip playback request runs an IDOR check against this pair.
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS "IDX_clip_shares_clip_user"
      ON "clip_shares" ("clip_id", "shared_with_user_id")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_clip_shares_clip_user"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_annotations_clip_frame"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_annotations_replay_event_id"`);
  }
}
