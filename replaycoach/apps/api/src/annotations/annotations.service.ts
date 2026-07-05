import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, IsNull } from 'typeorm';

import { Annotation, ReplayEvent, Clip } from '../database/entities/others.entities';

export interface CreateAnnotationPayload {
  sessionId: string;
  frameTimestampMs: number;
  type: string;
  geometry: any;
  textContent?: string;
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
    } else if (type === 'arrow') {
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
    } else if (type === 'text') {
      if ('x' in geometry) result.x = clampVal(geometry.x);
      if ('y' in geometry) result.y = clampVal(geometry.y);
    }

    return result;
  }

  async saveAnnotation(payload: CreateAnnotationPayload, userId: string): Promise<Annotation> {
    const { sessionId, frameTimestampMs, type, geometry, textContent } = payload;

    const latestReplayEvent = await this.replayEventRepository.findOne({
      where: { sessionId },
      order: { createdAt: 'DESC' },
    });

    if (!latestReplayEvent) {
      throw new NotFoundException(`No replay active flow tracking for sessionId ${sessionId}`);
    }

    const annotation = new Annotation();
    annotation.frameTimestampMs = frameTimestampMs;
    annotation.type = type;
    annotation.geometry = this.clampGeometry(type, geometry);
    annotation.textContent = this.sanitizeText(textContent);
    annotation.createdBy = userId;
    annotation.replayEventId = latestReplayEvent.id;
    annotation.clipId = null;

    this.logger.log(
      `Saving annotation: ${type} at frame ${frameTimestampMs} for session ${sessionId} (event ${latestReplayEvent.id})`,
    );

    return this.annotationRepository.save(annotation);
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
