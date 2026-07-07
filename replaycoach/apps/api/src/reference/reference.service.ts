import { BadRequestException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { v4 as uuidv4 } from 'uuid';

import { Annotation, Clip, ClipShare, ReferenceVideo, TrackedAnnotation } from '../database/entities/others.entities';
import { SessionParticipant } from '../sessions/session-participant.entity';
import { SessionsService } from '../sessions/sessions.service';
import { ReferenceStorageService } from './reference-storage.service';
import type {
  CreateTrackedAnnotationDto,
  ReferenceStroke,
  ReferenceVideoResponse,
  UpdateTrackedAnnotationDto,
} from './reference.dto';

const MAX_UPLOAD_BYTES = 500 * 1024 * 1024; // 500MB
const ALLOWED_MIME_TYPES = new Set(['video/mp4', 'video/quicktime', 'video/webm', 'video/x-matroska']);

export interface UploadedVideoFile {
  buffer: Buffer;
  originalname: string;
  mimetype: string;
  size: number;
}

/**
 * Converts a reference-modal Stroke (frame-indexed, drawn on an isolated
 * clip) into the existing Annotation entity's {type, geometry} shape, so
 * saved reference clips render through the same ClipPlaybackModal used for
 * recording-sourced clips. frameTimestampMs is the stroke's position within
 * the clip's OWN timeline (frameIndex / fps), matching how that player
 * computes its own currentTime from t=0.
 */
function strokeToAnnotationFields(stroke: ReferenceStroke): { type: string; geometry: Record<string, any> } | null {
  if (stroke.tool === 'freehand') {
    if (!stroke.points || stroke.points.length < 2) return null;
    return { type: 'pen', geometry: { points: stroke.points.flat() } };
  }
  if (stroke.tool === 'arrow' || stroke.tool === 'line') {
    if (!stroke.from || !stroke.to) return null;
    // No standalone "line" type exists in the shared annotation vocabulary —
    // rendered as an arrow (a plain line plus a small head).
    return { type: 'arrow', geometry: { from: stroke.from, to: stroke.to } };
  }
  if (stroke.tool === 'ellipse') {
    if (!stroke.from || !stroke.to) return null;
    if (stroke.centered) {
      const r = Math.hypot(stroke.to[0] - stroke.from[0], stroke.to[1] - stroke.from[1]);
      return { type: 'circle', geometry: { cx: stroke.from[0], cy: stroke.from[1], r } };
    }
    const cx = (stroke.from[0] + stroke.to[0]) / 2;
    const cy = (stroke.from[1] + stroke.to[1]) / 2;
    const rx = Math.abs(stroke.to[0] - stroke.from[0]) / 2;
    const ry = Math.abs(stroke.to[1] - stroke.from[1]) / 2;
    return { type: 'circle', geometry: { cx, cy, r: (rx + ry) / 2 } };
  }
  if (stroke.tool === 'rect') {
    if (!stroke.from || !stroke.to) return null;
    // No "rect" type in the shared vocabulary either — approximate as a
    // circle bounding the rectangle so it still renders (rare tool choice
    // for "circle this joint" teaching moments; acceptable simplification).
    const cx = (stroke.from[0] + stroke.to[0]) / 2;
    const cy = (stroke.from[1] + stroke.to[1]) / 2;
    const rx = Math.abs(stroke.to[0] - stroke.from[0]) / 2;
    const ry = Math.abs(stroke.to[1] - stroke.from[1]) / 2;
    return { type: 'circle', geometry: { cx, cy, r: Math.max(rx, ry) } };
  }
  return null;
}

@Injectable()
export class ReferenceService {
  private readonly logger = new Logger(ReferenceService.name);

  constructor(
    @InjectRepository(ReferenceVideo)
    private readonly repo: Repository<ReferenceVideo>,
    @InjectRepository(Clip)
    private readonly clipRepo: Repository<Clip>,
    @InjectRepository(ClipShare)
    private readonly clipShareRepo: Repository<ClipShare>,
    @InjectRepository(Annotation)
    private readonly annotationRepo: Repository<Annotation>,
    @InjectRepository(TrackedAnnotation)
    private readonly trackedRepo: Repository<TrackedAnnotation>,
    @InjectRepository(SessionParticipant)
    private readonly participantRepo: Repository<SessionParticipant>,
    private readonly sessionsService: SessionsService,
    private readonly storage: ReferenceStorageService,
    private readonly configService: ConfigService,
  ) {}

  private async assertCoach(sessionId: string, userId: string, role: string): Promise<void> {
    const session = await this.sessionsService.findById(sessionId);
    if (!session) throw new NotFoundException(`Session ${sessionId} not found`);
    if (session.coachId !== userId && role !== 'platform_admin') {
      throw new ForbiddenException('Only the session coach can manage reference videos');
    }
  }

  async upload(
    sessionId: string,
    userId: string,
    role: string,
    file: UploadedVideoFile | undefined,
    url: string | undefined,
    mode: 'full_body' | 'annotation_tracking' = 'full_body',
  ): Promise<ReferenceVideoResponse> {
    await this.assertCoach(sessionId, userId, role);

    if (!file && !url) {
      throw new BadRequestException('Provide either a video file or a url');
    }
    if (file && url) {
      throw new BadRequestException('Provide only one of: video file, url');
    }

    const id = uuidv4();
    let videoKey: string;

    if (url) {
      try {
        const parsed = new URL(url);
        if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
          throw new Error('unsupported protocol');
        }
      } catch {
        throw new BadRequestException('url must be a valid http(s) URL');
      }
      videoKey = url; // used directly — ReferenceStorageService.getPlaybackUrl() passes absolute URLs through
    } else {
      const f = file!;
      if (f.size > MAX_UPLOAD_BYTES) {
        throw new BadRequestException(`File too large (max ${MAX_UPLOAD_BYTES / 1024 / 1024}MB)`);
      }
      // Browser-recorded clips report a codec-qualified mimetype (e.g.
      // "video/webm;codecs=vp8") — compare the base type only.
      const baseMimeType = f.mimetype.split(';')[0]!.trim();
      if (!ALLOWED_MIME_TYPES.has(baseMimeType)) {
        throw new BadRequestException(`Unsupported file type: ${f.mimetype}`);
      }
      const ext = f.originalname.includes('.') ? f.originalname.split('.').pop() : 'mp4';
      videoKey = `sessions/${sessionId}/reference/${id}/original.${ext}`;
      await this.storage.saveBuffer(videoKey, f.buffer);
    }

    const row = this.repo.create({
      id,
      sessionId,
      uploadedByUserId: userId,
      videoKey,
      status: 'processing',
      analysisMode: mode,
    });
    const saved = await this.repo.save(row);

    this.kickOffPoseProcessing(saved).catch((err) => {
      this.logger.warn(`Failed to kick off pose processing for reference video ${id}: ${err instanceof Error ? err.message : err}`);
    });

    return this.toResponse(saved);
  }

  /** Non-fatal: a pose-service failure must never block presenting the raw video. */
  private async kickOffPoseProcessing(video: ReferenceVideo): Promise<void> {
    const baseUrl = this.configService.get<string>('POSE_SERVICE_URL', 'http://localhost:8100');
    const videoUrl = await this.storage.getPlaybackUrl(video.videoKey);
    const callbackUrl = `${this.storage.apiPublicBaseUrl}/api/v1/reference/${video.id}/complete`;
    const overlayUploadUrl = `${this.storage.apiPublicBaseUrl}/api/v1/reference/${video.id}/overlay`;
    const callbackToken = this.storage.callbackToken(video.id);

    try {
      const res = await fetch(`${baseUrl}/reference/process`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          refId: video.id,
          videoUrl,
          callbackUrl,
          overlayUploadUrl,
          callbackToken,
          mode: video.analysisMode,
        }),
      });
      if (!res.ok) {
        this.logger.warn(`pose-service rejected reference process request: ${res.status}`);
        await this.markFailed(video.id, `pose-service returned ${res.status}`);
      }
    } catch (err) {
      this.logger.warn(`pose-service unreachable for reference processing: ${err instanceof Error ? err.message : err}`);
      await this.markFailed(video.id, 'pose-service unreachable');
    }
  }

  async markFailed(id: string, reason: string): Promise<void> {
    await this.repo.update({ id }, { status: 'failed', failureReason: reason });
  }

  verifyCallbackToken(refId: string, token: string): boolean {
    return this.storage.verifyCallbackToken(refId, token);
  }

  /**
   * Saves the skeleton-burned-in video the pose-service produces (see
   * reference_processor.py) — called before the completion callback, so by
   * the time completeProcessing() flips status to 'ready' and auto-creates
   * the shared Clip, overlayVideoKey is already set and that Clip points at
   * the annotated video rather than the raw one.
   */
  async saveOverlayVideo(id: string, buffer: Buffer): Promise<void> {
    const video = await this.repo.findOne({ where: { id } });
    if (!video) throw new NotFoundException(`Reference video ${id} not found`);

    const overlayVideoKey = `sessions/${video.sessionId}/reference/${id}/overlay.mp4`;
    await this.storage.saveBuffer(overlayVideoKey, buffer);
    await this.repo.update({ id }, { overlayVideoKey });
  }

  /**
   * Called back by the pose-service on completion (see ReferenceController.complete).
   * Persists the keypoints JSON, flips the row to 'ready', and auto-saves +
   * shares the result as a Clip — every analyzed video is available to the
   * session's students automatically, without the coach saving manually.
   */
  async completeProcessing(
    id: string,
    keypoints: unknown,
    meta: {
      fps: number;
      frameCount: number;
      width: number;
      height: number;
      durationMs: number;
      keypointFormat?: 'coco17' | 'halpe26';
    },
  ): Promise<ReferenceVideo> {
    const video = await this.repo.findOne({ where: { id } });
    if (!video) throw new NotFoundException(`Reference video ${id} not found`);

    const keypointsKey = `sessions/${video.sessionId}/reference/${id}/keypoints.json`;
    await this.storage.saveJson(keypointsKey, keypoints);

    const { keypointFormat, ...numericMeta } = meta;
    await this.repo.update(
      { id },
      { status: 'ready', keypointsKey, keypointFormat: keypointFormat ?? 'coco17', ...numericMeta },
    );
    const updated = await this.repo.findOne({ where: { id } });
    if (!updated) throw new NotFoundException(`Reference video ${id} not found`);

    // Full Body Analysis auto-shares its burned-in overlay as a Clip on
    // ready. Annotation Tracking defers sharing until the coach exports (the
    // exported MP4 carries the annotations) — sharing the raw video now would
    // show students a video with no annotations.
    if (updated.analysisMode === 'full_body') {
      const existingClip = await this.clipRepo.findOne({ where: { referenceVideoId: id } });
      if (!existingClip) {
        await this.createClipForVideo(updated).catch((err) => {
          this.logger.warn(
            `Failed to auto-save reference video ${id} as a shared clip: ${err instanceof Error ? err.message : err}`,
          );
        });
      }
    }

    return updated;
  }

  /**
   * Auto-saves an analyzed reference video as a Clip and shares it with
   * every approved student in the session — this is what makes analyzed
   * clips always available afterward, whether they came from a live
   * "Analyze Last 10s" buffer grab or a coach-uploaded file, with no manual
   * save step. Uses SessionParticipant (not currently-connected LiveKit
   * participants) so students who already left by the time analysis
   * finishes (it can take minutes) are still included.
   */
  private async createClipForVideo(video: ReferenceVideo): Promise<Clip> {
    const title = `Analyzed Clip — ${video.createdAt.toLocaleString('en-US', {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    })}`;

    const clip = this.clipRepo.create({
      id: uuidv4(),
      sessionId: video.sessionId,
      createdBy: video.uploadedByUserId,
      startMs: 0,
      endMs: video.durationMs ?? 0,
      title,
      // Prefer the skeleton-burned-in overlay video — falls back to the raw
      // video only if overlay generation/upload failed (non-fatal).
      s3Key: video.overlayVideoKey ?? video.videoKey,
      clipType: 'reference',
      referenceVideoId: video.id,
    });
    await this.clipRepo.save(clip);

    const participants = await this.participantRepo.find({
      where: { sessionId: video.sessionId, roleInSession: 'student', status: 'approved' },
    });
    if (participants.length > 0) {
      const shares = participants.map((p) =>
        this.clipShareRepo.create({ clipId: clip.id, sharedWithUserId: p.userId }),
      );
      await this.clipShareRepo.save(shares);
    }

    this.logger.log(
      `Auto-saved reference video ${video.id} as Clip ${clip.id}, shared with ${participants.length} students`,
    );
    return clip;
  }

  async getForSession(sessionId: string, refId: string): Promise<ReferenceVideo> {
    const video = await this.repo.findOne({ where: { id: refId, sessionId } });
    if (!video) throw new NotFoundException(`Reference video ${refId} not found`);
    return video;
  }

  /** Coach's queue of uploaded/analyzed videos for this session, newest first. */
  async listForSession(sessionId: string, userId: string, role: string): Promise<ReferenceVideo[]> {
    await this.assertCoach(sessionId, userId, role);
    return this.repo.find({ where: { sessionId }, order: { createdAt: 'DESC' } });
  }

  async present(sessionId: string, refId: string, userId: string, role: string): Promise<ReferenceVideo> {
    await this.assertCoach(sessionId, userId, role);
    return this.getForSession(sessionId, refId);
  }

  /**
   * Syncs the coach's live drawings into the already auto-saved/shared Clip
   * for this reference video (see createClipForVideo/completeProcessing).
   * Appends rather than replaces: the modal's local strokesByFrame always
   * starts empty on open (even for a video the coach already drew on and
   * closed before, e.g. re-presented from the queue), so a "replace
   * wholesale" would silently wipe out anything synced in an earlier
   * session — reconstructing prior strokes back into editable form isn't
   * reliable either, since the DB stores rendered shapes, not original tool
   * choices (arrow/line collapse together, as do rect/ellipse). Falls back
   * to creating the clip here if analysis somehow finished without one
   * (e.g. a prior server restart mid-callback).
   */
  async syncAnnotations(
    sessionId: string,
    refId: string,
    coachId: string,
    role: string,
    strokesByFrame: Record<string, ReferenceStroke[]>,
  ): Promise<{ clipId: string }> {
    await this.assertCoach(sessionId, coachId, role);
    const video = await this.getForSession(sessionId, refId);

    let clip = await this.clipRepo.findOne({ where: { referenceVideoId: video.id } });
    if (!clip) {
      clip = await this.createClipForVideo(video);
    }

    const fps = video.fps ?? 30;
    const annotations: Annotation[] = [];
    for (const [frameIndexStr, strokes] of Object.entries(strokesByFrame ?? {})) {
      const frameIndex = parseInt(frameIndexStr, 10);
      if (!Number.isFinite(frameIndex) || !Array.isArray(strokes)) continue;
      const frameTimestampMs = Math.round((frameIndex / fps) * 1000);

      for (const stroke of strokes) {
        const converted = strokeToAnnotationFields(stroke);
        if (!converted) continue;
        annotations.push(
          this.annotationRepo.create({
            id: uuidv4(),
            clipId: clip.id,
            replayEventId: null,
            frameTimestampMs,
            type: converted.type,
            geometry: converted.geometry,
            createdBy: coachId,
          }),
        );
      }
    }
    if (annotations.length > 0) {
      await this.annotationRepo.save(annotations);
    }

    this.logger.log(
      `Appended ${annotations.length} annotations to Clip ${clip.id} for reference video ${refId}`,
    );

    return { clipId: clip.id };
  }

  async toResponse(video: ReferenceVideo): Promise<ReferenceVideoResponse> {
    const [videoUrl, keypointsUrl, overlayVideoUrl, exportVideoUrl] = await Promise.all([
      this.storage.getPlaybackUrl(video.videoKey),
      video.keypointsKey ? this.storage.getPlaybackUrl(video.keypointsKey) : Promise.resolve(null),
      video.overlayVideoKey ? this.storage.getPlaybackUrl(video.overlayVideoKey) : Promise.resolve(null),
      video.exportVideoKey ? this.storage.getPlaybackUrl(video.exportVideoKey) : Promise.resolve(null),
    ]);
    return {
      id: video.id,
      sessionId: video.sessionId,
      status: video.status,
      videoUrl,
      keypointsUrl,
      overlayVideoUrl,
      exportVideoUrl,
      analysisMode: video.analysisMode,
      keypointFormat: video.keypointFormat,
      fps: video.fps,
      frameCount: video.frameCount,
      width: video.width,
      height: video.height,
      durationMs: video.durationMs,
      failureReason: video.failureReason,
    };
  }

  // ── Tracked (joint-attached) annotations ────────────────────────────────

  private toTrackedResponse(a: TrackedAnnotation) {
    return {
      id: a.id,
      referenceVideoId: a.referenceVideoId,
      shapeType: a.shapeType,
      startJoint: a.startJoint,
      endJoint: a.endJoint,
      midJoint: a.midJoint,
      color: a.color,
      thickness: a.thickness,
      label: a.label,
      fromFrame: a.fromFrame,
      untilFrame: a.untilFrame,
      createdBy: a.createdBy,
      createdAt: a.createdAt.toISOString(),
    };
  }

  async listAnnotations(sessionId: string, refId: string) {
    await this.getForSession(sessionId, refId);
    const rows = await this.trackedRepo.find({
      where: { referenceVideoId: refId },
      order: { createdAt: 'ASC' },
    });
    return rows.map((r) => this.toTrackedResponse(r));
  }

  async createAnnotation(
    sessionId: string,
    refId: string,
    coachId: string,
    role: string,
    dto: CreateTrackedAnnotationDto,
  ) {
    await this.assertCoach(sessionId, coachId, role);
    await this.getForSession(sessionId, refId);
    const row = this.trackedRepo.create({
      id: uuidv4(),
      referenceVideoId: refId,
      shapeType: dto.shapeType,
      startJoint: dto.startJoint,
      endJoint: dto.endJoint ?? null,
      midJoint: dto.midJoint ?? null,
      color: dto.color,
      thickness: dto.thickness,
      label: dto.label ?? null,
      fromFrame: dto.fromFrame,
      untilFrame: dto.untilFrame ?? null,
      createdBy: coachId,
    });
    const saved = await this.trackedRepo.save(row);
    return this.toTrackedResponse(saved);
  }

  async updateAnnotation(
    sessionId: string,
    refId: string,
    annId: string,
    coachId: string,
    role: string,
    dto: UpdateTrackedAnnotationDto,
  ) {
    await this.assertCoach(sessionId, coachId, role);
    const row = await this.trackedRepo.findOne({ where: { id: annId, referenceVideoId: refId } });
    if (!row) throw new NotFoundException(`Annotation ${annId} not found`);
    if (dto.color !== undefined) row.color = dto.color;
    if (dto.thickness !== undefined) row.thickness = dto.thickness;
    if (dto.label !== undefined) row.label = dto.label;
    if (dto.untilFrame !== undefined) row.untilFrame = dto.untilFrame;
    const saved = await this.trackedRepo.save(row);
    return this.toTrackedResponse(saved);
  }

  async deleteAnnotation(sessionId: string, refId: string, annId: string, coachId: string, role: string) {
    await this.assertCoach(sessionId, coachId, role);
    await this.trackedRepo.delete({ id: annId, referenceVideoId: refId });
    return { success: true };
  }

  // ── Export (raw + skeleton + tracked annotations → MP4) ──────────────────

  /** Stores the pose-service-rendered export MP4 and (re)shares it as a Clip. */
  async saveExportVideo(id: string, buffer: Buffer): Promise<void> {
    const video = await this.repo.findOne({ where: { id } });
    if (!video) throw new NotFoundException(`Reference video ${id} not found`);
    const exportVideoKey = `sessions/${video.sessionId}/reference/${id}/export.mp4`;
    await this.storage.saveBuffer(exportVideoKey, buffer);
    await this.repo.update({ id }, { exportVideoKey });

    // Make the annotated export available to the session's students, reusing
    // the same auto-clip mechanism (updates the clip's video to the export).
    const updated = await this.repo.findOne({ where: { id } });
    if (updated) {
      const clip = await this.clipRepo.findOne({ where: { referenceVideoId: id } });
      if (clip) {
        clip.s3Key = exportVideoKey;
        await this.clipRepo.save(clip);
      } else {
        await this.createClipForVideo({ ...updated, overlayVideoKey: exportVideoKey } as ReferenceVideo).catch(
          (err) => this.logger.warn(`Export clip share failed for ${id}: ${err instanceof Error ? err.message : err}`),
        );
      }
    }
  }

  /** Kicks off a server-side export render on the pose-service (background). */
  async startExport(sessionId: string, refId: string, coachId: string, role: string): Promise<{ status: string }> {
    await this.assertCoach(sessionId, coachId, role);
    const video = await this.getForSession(sessionId, refId);
    if (!video.keypointsKey) throw new BadRequestException('Video has no keypoints to export');

    const annotations = await this.trackedRepo.find({ where: { referenceVideoId: refId } });
    const baseUrl = this.configService.get<string>('POSE_SERVICE_URL', 'http://localhost:8100');
    const videoUrl = await this.storage.getPlaybackUrl(video.videoKey);
    const keypointsUrl = await this.storage.getPlaybackUrl(video.keypointsKey);
    const uploadUrl = `${this.storage.apiPublicBaseUrl}/api/v1/reference/${refId}/export-upload`;
    const callbackToken = this.storage.callbackToken(refId);

    const res = await fetch(`${baseUrl}/reference/export`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        refId,
        videoUrl,
        keypointsUrl,
        uploadUrl,
        callbackToken,
        keypointFormat: video.keypointFormat,
        drawSkeleton: true,
        annotations: annotations.map((a) => ({
          shapeType: a.shapeType,
          startJoint: a.startJoint,
          endJoint: a.endJoint,
          midJoint: a.midJoint,
          color: a.color,
          thickness: a.thickness,
          fromFrame: a.fromFrame,
          untilFrame: a.untilFrame,
        })),
      }),
    });
    if (!res.ok) throw new BadRequestException(`pose-service export rejected (${res.status})`);
    return { status: 'accepted' };
  }
}
