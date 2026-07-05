import {
  Injectable,
  Logger,
  NotFoundException,
  ForbiddenException,
  UnprocessableEntityException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository, IsNull } from 'typeorm';
import { v4 as uuidv4 } from 'uuid';

import { Session } from '../sessions/session.entity';
import {
  Clip,
  ClipShare,
  Annotation,
  Recording,
} from '../database/entities/others.entities';
import { CloudFrontSigner } from '../media/cloudfront-signer';
import { CreateClipDto } from './clips.dto';

@Injectable()
export class ClipsService {
  private readonly logger = new Logger(ClipsService.name);

  constructor(
    @InjectRepository(Session)
    private readonly sessionRepository: Repository<Session>,
    @InjectRepository(Recording)
    private readonly recordingRepository: Repository<Recording>,
    @InjectRepository(Clip)
    private readonly clipRepository: Repository<Clip>,
    @InjectRepository(ClipShare)
    private readonly clipShareRepository: Repository<ClipShare>,
    @InjectRepository(Annotation)
    private readonly annotationRepository: Repository<Annotation>,
    private readonly cloudFrontSigner: CloudFrontSigner,
  ) {}

  /**
   * Coach saves a range of the active/ended session replay as a named Clip.
   * Copies frame annotations in the target timestamp range and links them to the new clip.
   */
  async createClip(
    sessionId: string,
    coachId: string,
    dto: CreateClipDto,
  ): Promise<Clip> {
    const session = await this.sessionRepository.findOne({
      where: { id: sessionId },
    });

    if (!session) {
      throw new NotFoundException(`Session ${sessionId} not found`);
    }

    if (session.coachId !== coachId) {
      throw new ForbiddenException('Only the session coach can create clips');
    }

    if (dto.startMs >= dto.endMs) {
      throw new UnprocessableEntityException('Start time must be less than end time');
    }

    // Generate clip entity
    const clip = new Clip();
    clip.id = uuidv4();
    clip.sessionId = sessionId;
    clip.createdBy = coachId;
    clip.startMs = dto.startMs;
    clip.endMs = dto.endMs;
    clip.title = dto.title;
    clip.s3Key = `sessions/${sessionId}/clips/${clip.id}/index.m3u8`;

    await this.clipRepository.save(clip);
    this.logger.log(`Created Clip: ID ${clip.id} ("${clip.title}") for session ${sessionId}`);

    // Fetch and duplicate annotations within frame range [startMs, endMs]
    const activeAnnotations = await this.annotationRepository.find({
      where: {
        replayEvent: {
          sessionId,
        },
        clipId: IsNull(),
      },
      relations: ['replayEvent'],
    });

    const inRangeAnnotations = activeAnnotations.filter(
      (ann) =>
        ann.frameTimestampMs >= dto.startMs && ann.frameTimestampMs <= dto.endMs,
    );

    if (inRangeAnnotations.length > 0) {
      const duplicatedAnnotations = inRangeAnnotations.map((ann) => {
        const copy = new Annotation();
        copy.id = uuidv4();
        copy.clipId = clip.id;
        copy.replayEventId = null;
        copy.frameTimestampMs = ann.frameTimestampMs;
        copy.type = ann.type;
        copy.geometry = ann.geometry;
        copy.textContent = ann.textContent;
        copy.createdBy = ann.createdBy;
        return copy;
      });

      await this.annotationRepository.save(duplicatedAnnotations);
      this.logger.log(
        `Cloned ${duplicatedAnnotations.length} annotations associated with Clip ${clip.id}`,
      );
    }

    // Save clip shares mapping if student list is supplied
    if (dto.studentIds && dto.studentIds.length > 0) {
      const shares = dto.studentIds.map((studentId) => {
        const share = new ClipShare();
        share.clipId = clip.id;
        share.sharedWithUserId = studentId;
        return share;
      });
      await this.clipShareRepository.save(shares);
      this.logger.log(`Shared Clip ${clip.id} with ${shares.length} students`);
    }

    return clip;
  }

  /**
   * Retrieves list of clips accessible by the user.
   * Coach role: returns all clips created by the coach.
   * Student role: returns only clips shared with the student.
   */
  async getClips(
    userId: string,
    role: string,
    sessionId?: string,
  ): Promise<Clip[]> {
    if (role === 'coach') {
      const where: any = { createdBy: userId };
      if (sessionId) where.sessionId = sessionId;
      return this.clipRepository.find({
        where,
        order: { createdAt: 'DESC' },
        relations: ['session'],
      });
    } else {
      // Find shared clips
      const shares = await this.clipShareRepository.find({
        where: { sharedWithUserId: userId },
        relations: ['clip', 'clip.session'],
      });

      let clips = shares.map((s) => s.clip);

      if (sessionId) {
        clips = clips.filter((c) => c.sessionId === sessionId);
      }

      // Sort programmatically by creation date descending
      return clips.sort(
        (a, b) => b.createdAt.getTime() - a.createdAt.getTime(),
      );
    }
  }

  /**
   * Retrieves detailed clip metadata, signed play URL, and dynamically linked annotations.
   * Enforces server-side authorization check (IDOR gate checking).
   */
  async getClip(
    clipId: string,
    userId: string,
    role: string,
  ): Promise<{ clip: Clip; playUrl: string; annotations: Annotation[] }> {
    const clip = await this.clipRepository.findOne({
      where: { id: clipId },
      relations: ['session'],
    });

    if (!clip) {
      throw new NotFoundException(`Clip ${clipId} not found`);
    }

    // Server-side security check (IDOR protection)
    if (role !== 'platform_admin' && clip.createdBy !== userId) {
      // If student, check if clip was explicitly shared
      if (role === 'student') {
        const shareExists = await this.clipShareRepository.findOne({
          where: { clipId, sharedWithUserId: userId },
        });
        if (!shareExists) {
          throw new ForbiddenException(
            'Access denied. You do not have permissions for this clip.',
          );
        }
      } else {
        // Coach requesting another coach's private clips
        throw new ForbiddenException('Access denied. You do not own this clip.');
      }
    }

    // Reuse CloudFront CDN signing configuration
    const playUrl = this.cloudFrontSigner.signUrl(clip.s3Key);

    // Retrieve dynamically toggleable annotations
    const annotations = await this.annotationRepository.find({
      where: { clipId },
      order: { frameTimestampMs: 'ASC' },
    });

    return {
      clip,
      playUrl,
      annotations,
    };
  }

  /**
   * Share an existing clip with designated students.
   */
  async shareClip(
    clipId: string,
    coachId: string,
    studentIds: string[],
  ): Promise<{ success: boolean }> {
    const clip = await this.clipRepository.findOne({
      where: { id: clipId },
    });

    if (!clip) {
      throw new NotFoundException(`Clip ${clipId} not found`);
    }

    if (clip.createdBy !== coachId) {
      throw new ForbiddenException('Only the creator of the clip can manage shares');
    }

    const currentShares = await this.clipShareRepository.find({
      where: { clipId },
    });

    const currentStudentIds = currentShares.map((s) => s.sharedWithUserId);

    // Delete shares not in studentIds
    const toDelete = currentShares.filter((s) => !studentIds.includes(s.sharedWithUserId));
    if (toDelete.length > 0) {
      await this.clipShareRepository.remove(toDelete);
      this.logger.log(`Removed ${toDelete.length} shares for Clip ${clipId}`);
    }

    const newShares = studentIds
      .filter((id) => !currentStudentIds.includes(id))
      .map((studentId) => {
        const share = new ClipShare();
        share.clipId = clipId;
        share.sharedWithUserId = studentId;
        return share;
      });

    if (newShares.length > 0) {
      await this.clipShareRepository.save(newShares);
      this.logger.log(`Added ${newShares.length} new shares for Clip ${clipId}`);
    }

    return { success: true };
  }
}
