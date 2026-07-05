import type { MigrationInterface, QueryRunner } from 'typeorm';

export class AddSessionAccessControl1783200780006 implements MigrationInterface {
  name = 'AddSessionAccessControl1783200780006';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // 1. Add access_type column to sessions
    await queryRunner.query(`
      ALTER TABLE "sessions" ADD COLUMN "access_type" VARCHAR(50) NOT NULL DEFAULT 'public'
    `);

    // 2. Add invite_code column (temporarily nullable) to sessions
    await queryRunner.query(`
      ALTER TABLE "sessions" ADD COLUMN "invite_code" VARCHAR(255) NULL
    `);

    // 3. Set unique values for invite_code for any existing sessions to prevent constraints violation
    await queryRunner.query(`
      UPDATE "sessions" SET "invite_code" = gen_random_uuid()::text WHERE "invite_code" IS NULL
    `);

    // 4. Set invite_code column to NOT NULL and add uniqueness
    await queryRunner.query(`
      ALTER TABLE "sessions" ALTER COLUMN "invite_code" SET NOT NULL
    `);
    await queryRunner.query(`
      ALTER TABLE "sessions" ADD CONSTRAINT "UQ_sessions_invite_code" UNIQUE ("invite_code")
    `);

    // 5. Add check constraint on sessions.access_type
    await queryRunner.query(`
      ALTER TABLE "sessions" ADD CONSTRAINT "CK_sessions_access_type" CHECK ("access_type" IN ('public', 'lobby'))
    `);

    // 6. Add status column to session_participants (default 'approved')
    await queryRunner.query(`
      ALTER TABLE "session_participants" ADD COLUMN "status" VARCHAR(50) NOT NULL DEFAULT 'approved'
    `);

    // 7. Add check constraint on session_participants.status
    await queryRunner.query(`
      ALTER TABLE "session_participants" ADD CONSTRAINT "CK_session_participants_status" CHECK ("status" IN ('pending', 'approved', 'rejected'))
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "session_participants" DROP CONSTRAINT "CK_session_participants_status"
    `);
    await queryRunner.query(`
      ALTER TABLE "session_participants" DROP COLUMN "status"
    `);
    await queryRunner.query(`
      ALTER TABLE "sessions" DROP CONSTRAINT "CK_sessions_access_type"
    `);
    await queryRunner.query(`
      ALTER TABLE "sessions" DROP CONSTRAINT "UQ_sessions_invite_code"
    `);
    await queryRunner.query(`
      ALTER TABLE "sessions" DROP COLUMN "invite_code"
    `);
    await queryRunner.query(`
      ALTER TABLE "sessions" DROP COLUMN "access_type"
    `);
  }
}
