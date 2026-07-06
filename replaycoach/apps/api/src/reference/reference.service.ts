import { BadRequestException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { ConfigService } from '@nestjs/config';
import { v4 as uuidv4 } from 'uuid';

import { Annotation, Clip, ClipShare, ReferenceVideo } from '../database/entities/others.entities';
import { SessionsService } from '../sessions/sessions.service';
import { ReferenceStorageService } from './reference-storage.service';
import type { ReferenceStroke, ReferenceVideoResponse } from './reference.dto';

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
    const callbackToken = this.storage.callbackToken(video.id);

    try {
      const res = await fetch(`${baseUrl}/reference/process`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refId: video.id, videoUrl, callbackUrl, callbackToken }),
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
   * Called back by the pose-service on completion (see ReferenceController.complete).
   * Persists the keypoints JSON and flips the row to 'ready'.
   */
  async completeProcessing(
    id: string,
    keypoints: unknown,
    meta: { fps: number; frameCount: number; width: number; height: number; durationMs: number },
  ): Promise<ReferenceVideo> {
    const video = await this.repo.findOne({ where: { id } });
    if (!video) throw new NotFoundException(`Reference video ${id} not found`);

    const keypointsKey = `sessions/${video.sessionId}/reference/${id}/keypoints.json`;
    await this.storage.saveJson(keypointsKey, keypoints);

    await this.repo.update({ id }, { status: 'ready', keypointsKey, ...meta });
    const updated = await this.repo.findOne({ where: { id } });
    if (!updated) throw new NotFoundException(`Reference video ${id} not found`);
    return updated;
  }

  async getForSession(sessionId: string, refId: string): Promise<ReferenceVideo> {
    const video = await this.repo.findOne({ where: { id: refId, sessionId } });
    if (!video) throw new NotFoundException(`Reference video ${refId} not found`);
    return video;
  }

  async present(sessionId: string, refId: string, userId: string, role: string): Promise<ReferenceVideo> {
    await this.assertCoach(sessionId, userId, role);
    return this.getForSession(sessionId, refId);
  }

  /**
   * Coach saves the analyzed clip (the reference video itself, not the pose
   * detections) plus whatever they drew on it as a real, shareable Clip —
   * reuses the existing Clip/ClipShare/Annotation tables and the coach/
   * student clips dashboards, rather than a parallel storage path.
   */
  async saveAsClip(
    sessionId: string,
    refId: string,
    coachId: string,
    role: string,
    dto: { title: string; studentIds?: string[]; strokesByFrame: Record<string, ReferenceStroke[]> },
  ): Promise<{ clipId: string }> {
    await this.assertCoach(sessionId, coachId, role);
    const video = await this.getForSession(sessionId, refId);

    const clip = this.clipRepo.create({
      id: uuidv4(),
      sessionId,
      createdBy: coachId,
      startMs: 0,
      endMs: video.durationMs ?? 0,
      title: dto.title,
      s3Key: video.videoKey,
      clipType: 'reference',
      referenceVideoId: video.id,
    });
    await this.clipRepo.save(clip);

    const fps = video.fps ?? 30;
    const annotations: Annotation[] = [];
    for (const [frameIndexStr, strokes] of Object.entries(dto.strokesByFrame ?? {})) {
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

    if (dto.studentIds && dto.studentIds.length > 0) {
      const shares = dto.studentIds.map((studentId) =>
        this.clipShareRepo.create({ clipId: clip.id, sharedWithUserId: studentId }),
      );
      await this.clipShareRepo.save(shares);
    }

    this.logger.log(
      `Saved reference video ${refId} as Clip ${clip.id} ("${dto.title}") with ${annotations.length} annotations, shared with ${dto.studentIds?.length ?? 0} students`,
    );

    return { clipId: clip.id };
  }

  async toResponse(video: ReferenceVideo): Promise<ReferenceVideoResponse> {
    const [videoUrl, keypointsUrl] = await Promise.all([
      this.storage.getPlaybackUrl(video.videoKey),
      video.keypointsKey ? this.storage.getPlaybackUrl(video.keypointsKey) : Promise.resolve(null),
    ]);
    return {
      id: video.id,
      sessionId: video.sessionId,
      status: video.status,
      videoUrl,
      keypointsUrl,
      fps: video.fps,
      frameCount: video.frameCount,
      width: video.width,
      height: video.height,
      durationMs: video.durationMs,
      failureReason: video.failureReason,
    };
  }
}
