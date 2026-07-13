import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, IsNull } from 'typeorm';

import { Annotation, ReplayEvent, Clip } from '../database/entities/others.entities';

export interface CreateAnnotationPayload {
  /** Client-generated UUID — set BEFORE the socket broadcast goes out (not
   * after the DB write completes, which is fire-and-forget for latency
   * reasons), so every client that receives the broadcast — including the
   * drawing coach's own client, which already added it optimistically —
   * can de-dupe by id instead of only by best-effort field matching. */
  id?: string;
  sessionId: string;
  frameTimestampMs: number;
  type: string;
  geometry: any;
  textContent?: string;
  color?: string;
  thickness?: number;
  persistUntilCleared?: boolean;
}

@Injectable()
export class AnnotationsService {
  private readonly logger = new Logger(AnnotationsService.name);

  constructor(
    @InjectRepository(Annotation)
    private readonly annotationRepository: Repository<Annotation>,
    @InjectRepository(ReplayEvent)
    private readonly replayEventRepository: Repository<ReplayEvent>,
    @InjectRepository(Clip)
    private readonly clipRepository: Repository<Clip>,
  ) {}

  private clamp(val: number): number {
    return Math.max(0, Math.min(1, val));
  }

  private sanitizeText(text?: string): string | null {
    if (!text) return null;
    const truncated = text.slice(0, 200);
    // Strip simple HTML tags to avoid HTML rendering injection risks
    return truncated.replace(/<\/?[^>]+(>|$)/g, '');
  }

  /** Plain string, capped length — a joint name (e.g. "left_shoulder") plus
   * the id of whichever participant's skeleton it's attached to. Not
   * validated against the live keypoint-name list: the frontend resolves
   * these against whatever pose data it currently has, so an unrecognized
   * name just fails to resolve client-side (annotation falls back to its
   * last known pixel position) rather than needing server-side awareness
   * of the pose format in use. */
  private sanitizeJointName(val: any): string | undefined {
    if (typeof val !== 'string' || val.length === 0 || val.length > 40) return undefined;
    return val;
  }

  private clampJointRef(geometry: any): Record<string, any> | undefined {
    const ref = geometry?.jointRef;
    if (!ref || typeof ref !== 'object') return undefined;
    const participantId = typeof ref.participantId === 'string' ? ref.participantId.slice(0, 255) : undefined;
    const startJoint = this.sanitizeJointName(ref.startJoint ?? ref.joint ?? ref.centerJoint);
    if (!participantId || !startJoint) return undefined;
    const endJoint = this.sanitizeJointName(ref.endJoint);
    const midJoint = this.sanitizeJointName(ref.midJoint);
    return {
      participantId,
      startJoint,
      ...(endJoint ? { endJoint } : {}),
      ...(midJoint ? { midJoint } : {}),
    };
  }

  private clampGeometry(type: string, geometry: any): any {
    if (!geometry || typeof geometry !== 'object') return {};
    const result = { ...geometry };

    const clampVal = (val: any): number => {
      if (typeof val === 'number') return this.clamp(val);
      const parsed = parseFloat(val);
      return isNaN(parsed) ? 0 : this.clamp(parsed);
    };

    if (type === 'freehand' || type === 'pen') {
      if (Array.isArray(geometry.points)) {
        result.points = geometry.points.map((p: any) => clampVal(p));
      }
    } else if (type === 'arrow' || type === 'line') {
      if (Array.isArray(geometry.from)) {
        result.from = geometry.from.slice(0, 2).map((p: any) => clampVal(p));
      }
      if (Array.isArray(geometry.to)) {
        result.to = geometry.to.slice(0, 2).map((p: any) => clampVal(p));
      }
    } else if (type === 'circle' || type === 'ellipse') {
      if ('cx' in geometry) result.cx = clampVal(geometry.cx);
      if ('cy' in geometry) result.cy = clampVal(geometry.cy);
      if ('r' in geometry) result.r = clampVal(geometry.r);
      if ('rx' in geometry) result.rx = clampVal(geometry.rx);
      if ('ry' in geometry) result.ry = clampVal(geometry.ry);
    } else if (type === 'rectangle') {
      if ('x' in geometry) result.x = clampVal(geometry.x);
      if ('y' in geometry) result.y = clampVal(geometry.y);
      if ('width' in geometry) result.width = clampVal(geometry.width);
      if ('height' in geometry) result.height = clampVal(geometry.height);
    } else if (type === 'angle') {
      if (Array.isArray(geometry.a)) result.a = geometry.a.slice(0, 2).map((p: any) => clampVal(p));
      if (Array.isArray(geometry.vertex)) result.vertex = geometry.vertex.slice(0, 2).map((p: any) => clampVal(p));
      if (Array.isArray(geometry.b)) result.b = geometry.b.slice(0, 2).map((p: any) => clampVal(p));
    } else if (type === 'point' || type === 'text') {
      if ('x' in geometry) result.x = clampVal(geometry.x);
      if ('y' in geometry) result.y = clampVal(geometry.y);
    }

    const jointRef = this.clampJointRef(geometry);
    if (jointRef) result.jointRef = jointRef;
    else delete result.jointRef;

    return result;
  }

  async saveAnnotation(payload: CreateAnnotationPayload, userId: string): Promise<Annotation> {
    const { id, sessionId, frameTimestampMs, type, geometry, textContent, color, thickness, persistUntilCleared } = payload;

    const latestReplayEvent = await this.replayEventRepository.findOne({
      where: { sessionId },
      order: { createdAt: 'DESC' },
    });

    if (!latestReplayEvent) {
      throw new NotFoundException(`No replay active flow tracking for sessionId ${sessionId}`);
    }

    const annotation = new Annotation();
    // Explicitly set (not left to PrimaryGeneratedColumn's default) so the
    // id matches what was already broadcast to every client — see
    // CreateAnnotationPayload.id.
    if (id) annotation.id = id;
    annotation.frameTimestampMs = frameTimestampMs;
    annotation.type = type;
    annotation.geometry = this.clampGeometry(type, geometry);
    annotation.textContent = this.sanitizeText(textContent);
    annotation.color = typeof color === 'string' ? color.slice(0, 20) : null;
    annotation.thickness = typeof thickness === 'number' ? Math.max(1, Math.min(20, Math.round(thickness))) : 3;
    annotation.persistUntilCleared = Boolean(persistUntilCleared);
    annotation.createdBy = userId;
    annotation.replayEventId = latestReplayEvent.id;
    annotation.clipId = null;

    this.logger.log(
      `Saving annotation: ${type} at frame ${frameTimestampMs} for session ${sessionId} (event ${latestReplayEvent.id})`,
    );

    return this.annotationRepository.save(annotation);
  }

  /** Removes one specific annotation by id (select + delete), as opposed to
   * undoLastAnnotation (most recent) or clearAnnotations (tombstone-all on
   * a frame) — needed for persistent joint-attached shapes, which aren't
   * naturally "the last one" or "everything on this exact frame." */
  async deleteAnnotation(sessionId: string, id: string): Promise<void> {
    const annotation = await this.annotationRepository.findOne({
      where: { id, replayEvent: { sessionId } },
      relations: ['replayEvent'],
    });
    if (!annotation) return;
    await this.annotationRepository.remove(annotation);
  }

  async undoLastAnnotation(sessionId: string, userId: string, frameTimestampMs: number): Promise<void> {
    const lastAnnotation = await this.annotationRepository.findOne({
      where: {
        createdBy: userId,
        frameTimestampMs,
        clipId: IsNull(),
        replayEvent: {
          sessionId,
        },
      },
      relations: ['replayEvent'],
      order: { createdAt: 'DESC' },
    });

    if (lastAnnotation) {
      this.logger.log(`Undoing last annotation: ID ${lastAnnotation.id}`);
      await this.annotationRepository.remove(lastAnnotation);
    } else {
      this.logger.warn(`No undo target found on frame ${frameTimestampMs} for session ${sessionId}`);
    }
  }

  async clearAnnotations(sessionId: string, userId: string, frameTimestampMs: number): Promise<Annotation> {
    const latestReplayEvent = await this.replayEventRepository.findOne({
      where: { sessionId },
      order: { createdAt: 'DESC' },
    });

    if (!latestReplayEvent) {
      throw new NotFoundException(`No active replay flow tracking for sessionId ${sessionId}`);
    }

    const tombstone = new Annotation();
    tombstone.frameTimestampMs = frameTimestampMs;
    tombstone.type = 'tombstone';
    tombstone.geometry = {};
    tombstone.textContent = null;
    tombstone.createdBy = userId;
    tombstone.replayEventId = latestReplayEvent.id;
    tombstone.clipId = null;

    this.logger.log(`Appending clear tombstone on frame ${frameTimestampMs} for session ${sessionId}`);
    return this.annotationRepository.save(tombstone);
  }

  async getAnnotationsByClip(clipId: string): Promise<Annotation[]> {
    const clip = await this.clipRepository.findOne({ where: { id: clipId } });
    if (!clip) {
      throw new NotFoundException(`Clip ${clipId} not found`);
    }

    return this.annotationRepository.find({
      where: { clipId },
      order: { createdAt: 'ASC' },
    });
  }

  async getAnnotationsBySession(sessionId: string): Promise<Annotation[]> {
    return this.annotationRepository.find({
      where: {
        replayEvent: {
          sessionId,
        },
      },
      order: { createdAt: 'ASC' },
    });
  }
}
