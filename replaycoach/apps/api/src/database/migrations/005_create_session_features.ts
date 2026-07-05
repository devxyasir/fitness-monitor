import type { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateSessionFeatures1751579400005 implements MigrationInterface {
  name = 'CreateSessionFeatures1751579400005';

  public async up(queryRunner: QueryRunner): Promise<void> {
    // 1. Sessions table
    await queryRunner.query(`
      CREATE TABLE "sessions" (
        "id"                 UUID         NOT NULL DEFAULT gen_random_uuid(),
        "coach_id"           UUID         NOT NULL,
        "org_id"             UUID         NULL,
        "status"             VARCHAR(50)  NOT NULL DEFAULT 'scheduled',
        "livekit_room_name"  VARCHAR(255) NOT NULL,
        "scheduled_at"       TIMESTAMPTZ  NOT NULL,
        "started_at"         TIMESTAMPTZ  NULL,
        "ended_at"           TIMESTAMPTZ  NULL,
        "retention_days"     INTEGER      NOT NULL DEFAULT 90,
        CONSTRAINT "PK_sessions" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_sessions_room" UNIQUE ("livekit_room_name"),
        CONSTRAINT "CK_sessions_status" CHECK ("status" IN ('scheduled', 'live', 'ended', 'processed', 'archived')),
        CONSTRAINT "FK_sessions_coach" FOREIGN KEY ("coach_id") REFERENCES "users"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_sessions_org" FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE SET NULL
      )
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_sessions_coach_status" ON "sessions" ("coach_id", "status")
    `);

    // 2. Session Participants table
    await queryRunner.query(`
      CREATE TABLE "session_participants" (
        "id"              UUID         NOT NULL DEFAULT gen_random_uuid(),
        "session_id"      UUID         NOT NULL,
        "user_id"         UUID         NOT NULL,
        "role_in_session" VARCHAR(50)  NOT NULL,
        "joined_at"       TIMESTAMPTZ  NOT NULL DEFAULT now(),
        "left_at"         TIMESTAMPTZ  NULL,
        CONSTRAINT "PK_session_participants" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_session_participants_session_user" UNIQUE ("session_id", "user_id"),
        CONSTRAINT "CK_session_participants_role" CHECK ("role_in_session" IN ('coach', 'student')),
        CONSTRAINT "FK_session_participants_session" FOREIGN KEY ("session_id") REFERENCES "sessions"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_session_participants_user" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE
      )
    `);

    // 3. Recordings table
    await queryRunner.query(`
      CREATE TABLE "recordings" (
        "id"               UUID         NOT NULL DEFAULT gen_random_uuid(),
        "session_id"       UUID         NOT NULL,
        "participant_id"   UUID         NOT NULL,
        "track_type"       VARCHAR(50)  NOT NULL,
        "s3_key_prefix"    VARCHAR(512) NOT NULL,
        "status"           VARCHAR(50)  NOT NULL DEFAULT 'recording',
        "duration_seconds" INTEGER      NOT NULL DEFAULT 0,
        "created_at"       TIMESTAMPTZ  NOT NULL DEFAULT now(),
        CONSTRAINT "PK_recordings" PRIMARY KEY ("id"),
        CONSTRAINT "CK_recordings_status" CHECK ("status" IN ('recording', 'finalizing', 'ready', 'failed')),
        CONSTRAINT "FK_recordings_session" FOREIGN KEY ("session_id") REFERENCES "sessions"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_recordings_participant" FOREIGN KEY ("participant_id") REFERENCES "users"("id") ON DELETE CASCADE
      )
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_recordings_session_participant" ON "recordings" ("session_id", "participant_id")
    `);

    // 4. Pose Keypoint Frames table
    await queryRunner.query(`
      CREATE TABLE "pose_keypoint_frames" (
        "id"                 UUID             NOT NULL DEFAULT gen_random_uuid(),
        "recording_id"       UUID             NOT NULL,
        "frame_timestamp_ms" INTEGER          NOT NULL,
        "keypoints"          JSONB            NOT NULL,
        "confidence_avg"     DOUBLE PRECISION NOT NULL,
        CONSTRAINT "PK_pose_keypoint_frames" PRIMARY KEY ("id"),
        CONSTRAINT "FK_pose_keypoint_frames_recording" FOREIGN KEY ("recording_id") REFERENCES "recordings"("id") ON DELETE CASCADE
      )
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_pose_frames" ON "pose_keypoint_frames" ("recording_id", "frame_timestamp_ms")
    `);

    // 5. Replay Events table
    await queryRunner.query(`
      CREATE TABLE "replay_events" (
        "id"                    UUID        NOT NULL DEFAULT gen_random_uuid(),
        "session_id"            UUID        NOT NULL,
        "initiated_by"          UUID        NOT NULL,
        "target_participant_id" UUID        NULL,
        "seek_timestamp_ms"     INTEGER     NOT NULL,
        "shared_with_user_ids"  JSONB       NOT NULL DEFAULT '[]'::jsonb,
        "created_at"            TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "PK_replay_events" PRIMARY KEY ("id"),
        CONSTRAINT "FK_replay_events_session" FOREIGN KEY ("session_id") REFERENCES "sessions"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_replay_events_actor" FOREIGN KEY ("initiated_by") REFERENCES "users"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_replay_events_target" FOREIGN KEY ("target_participant_id") REFERENCES "users"("id") ON DELETE SET NULL
      )
    `);

    // 6. Clips table
    await queryRunner.query(`
      CREATE TABLE "clips" (
        "id"         UUID         NOT NULL DEFAULT gen_random_uuid(),
        "session_id" UUID         NOT NULL,
        "created_by" UUID         NOT NULL,
        "start_ms"   INTEGER      NOT NULL,
        "end_ms"     INTEGER      NOT NULL,
        "title"      VARCHAR(255) NOT NULL,
        "s3_key"     VARCHAR(512) NOT NULL,
        "created_at" TIMESTAMPTZ  NOT NULL DEFAULT now(),
        CONSTRAINT "PK_clips" PRIMARY KEY ("id"),
        CONSTRAINT "FK_clips_session" FOREIGN KEY ("session_id") REFERENCES "sessions"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_clips_creator" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE CASCADE
      )
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_clips_session" ON "clips" ("session_id")
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_clips_creator" ON "clips" ("created_by")
    `);

    // 7. Annotations table
    await queryRunner.query(`
      CREATE TABLE "annotations" (
        "id"                 UUID         NOT NULL DEFAULT gen_random_uuid(),
        "clip_id"            UUID         NULL,
        "replay_event_id"    UUID         NULL,
        "frame_timestamp_ms" INTEGER      NOT NULL,
        "type"               VARCHAR(50)  NOT NULL,
        "geometry"           JSONB        NOT NULL,
        "text_content"       TEXT         NULL,
        "created_by"         UUID         NOT NULL,
        "created_at"         TIMESTAMPTZ  NOT NULL DEFAULT now(),
        CONSTRAINT "PK_annotations" PRIMARY KEY ("id"),
        CONSTRAINT "FK_annotations_clip" FOREIGN KEY ("clip_id") REFERENCES "clips"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_annotations_replay" FOREIGN KEY ("replay_event_id") REFERENCES "replay_events"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_annotations_creator" FOREIGN KEY ("created_by") REFERENCES "users"("id") ON DELETE CASCADE
      )
    `);

    // 8. Clip Shares table
    await queryRunner.query(`
      CREATE TABLE "clip_shares" (
        "id"                  UUID        NOT NULL DEFAULT gen_random_uuid(),
        "clip_id"             UUID        NOT NULL,
        "shared_with_user_id" UUID        NOT NULL,
        "created_at"          TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "PK_clip_shares" PRIMARY KEY ("id"),
        CONSTRAINT "FK_clip_shares_clip" FOREIGN KEY ("clip_id") REFERENCES "clips"("id") ON DELETE CASCADE,
        CONSTRAINT "FK_clip_shares_recipient" FOREIGN KEY ("shared_with_user_id") REFERENCES "users"("id") ON DELETE CASCADE
      )
    `);

    // 9. Subscriptions table
    await queryRunner.query(`
      CREATE TABLE "subscriptions" (
        "id"                 UUID         NOT NULL DEFAULT gen_random_uuid(),
        "org_id"             UUID         NOT NULL,
        "stripe_customer_id" VARCHAR(255) NOT NULL,
        "plan"               VARCHAR(100) NOT NULL,
        "seat_count"         INTEGER      NOT NULL DEFAULT 1,
        "current_period_end" TIMESTAMPTZ  NOT NULL,
        CONSTRAINT "PK_subscriptions" PRIMARY KEY ("id"),
        CONSTRAINT "FK_subscriptions_org" FOREIGN KEY ("org_id") REFERENCES "organizations"("id") ON DELETE CASCADE
      )
    `);

    // 10. Audit Logs table
    await queryRunner.query(`
      CREATE TABLE "audit_logs" (
        "id"            UUID        NOT NULL DEFAULT gen_random_uuid(),
        "actor_user_id" UUID        NULL,
        "action"        VARCHAR(100) NOT NULL,
        "resource_type" VARCHAR(100) NOT NULL,
        "resource_id"   UUID        NULL,
        "metadata"      JSONB       NOT NULL DEFAULT '{}'::jsonb,
        "ip_address"    INET        NULL,
        "created_at"    TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "PK_audit_logs" PRIMARY KEY ("id"),
        CONSTRAINT "FK_audit_logs_actor" FOREIGN KEY ("actor_user_id") REFERENCES "users"("id") ON DELETE SET NULL
      )
    `);

    await queryRunner.query(`
      CREATE INDEX "IDX_audit_logs_actor_time" ON "audit_logs" ("actor_user_id", "created_at")
    `);
    await queryRunner.query(`
      CREATE INDEX "IDX_audit_logs_resource" ON "audit_logs" ("resource_type", "resource_id")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE "audit_logs"`);
    await queryRunner.query(`DROP TABLE "subscriptions"`);
    await queryRunner.query(`DROP TABLE "clip_shares"`);
    await queryRunner.query(`DROP TABLE "annotations"`);
    await queryRunner.query(`DROP TABLE "clips"`);
    await queryRunner.query(`DROP TABLE "replay_events"`);
    await queryRunner.query(`DROP TABLE "pose_keypoint_frames"`);
    await queryRunner.query(`DROP TABLE "recordings"`);
    await queryRunner.query(`DROP TABLE "session_participants"`);
    await queryRunner.query(`DROP TABLE "sessions"`);
  }
}
