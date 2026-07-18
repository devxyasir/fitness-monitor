import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Head,
  Headers,
  NotFoundException,
  Param,
  Patch,
  Post,
  Query,
  Req,
  Res,
  UnauthorizedException,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Throttle } from '@nestjs/throttler';
import type { Request, Response } from 'express';

import { CurrentUser } from '../common/decorators/current-user.decorator';
import { Public } from '../common/decorators/public.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { SessionsGuard } from '../sessions/sessions.guard';
import { RealtimeGateway } from '../realtime/realtime.gateway';
import type { JwtPayload } from '@replaycoach/types';

import { ReferenceService } from './reference.service';
import { ReferenceStorageService } from './reference-storage.service';
import {
  CreateTrackedAnnotationDto,
  ExportReferenceVideoDto,
  SyncReferenceAnnotationsDto,
  UpdateTrackedAnnotationDto,
  UploadReferenceVideoDto,
} from './reference.dto';

const MAX_UPLOAD_BYTES = 500 * 1024 * 1024; // 500MB

@Controller('sessions/:id/reference')
@UseGuards(JwtAuthGuard, RolesGuard, SessionsGuard)
export class ReferenceController {
  constructor(
    private readonly referenceService: ReferenceService,
    private readonly realtimeGateway: RealtimeGateway,
  ) {}

   /** Coach uploads a video (buffered clip or file picker) or pastes a URL. */
  @Post('upload')
  @Throttle({ default: { limit: 10, ttl: 3600000 } })
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_UPLOAD_BYTES } }))
  async upload(
    @Param('id') sessionId: string,
    @CurrentUser() user: JwtPayload,
    @Body() dto: UploadReferenceVideoDto,
    @UploadedFile() file: Express.Multer.File | undefined,
  ) {
    return this.referenceService.upload(
      sessionId,
      user.sub,
      user.role,
      file
        ? { buffer: file.buffer, originalname: file.originalname, mimetype: file.mimetype, size: file.size }
        : undefined,
      dto.url,
      dto.mode ?? 'full_body',
    );
  }

  /** Coach's queue of uploaded/analyzed videos for this session — newest first. */
  @Get()
  async list(@Param('id') sessionId: string, @CurrentUser() user: JwtPayload) {
    const videos = await this.referenceService.listForSession(sessionId, user.sub, user.role);
    return Promise.all(videos.map((v) => this.referenceService.toResponse(v)));
  }

  @Get(':refId')
  async get(@Param('id') sessionId: string, @Param('refId') refId: string) {
    const video = await this.referenceService.getForSession(sessionId, refId);
    return this.referenceService.toResponse(video);
  }

  /** Coach presents the reference video to the whole room. */
  @Post(':refId/present')
  async present(
    @Param('id') sessionId: string,
    @Param('refId') refId: string,
    @CurrentUser() user: JwtPayload,
  ) {
    const video = await this.referenceService.present(sessionId, refId, user.sub, user.role);
    const response = await this.referenceService.toResponse(video);
    this.realtimeGateway.emitReferenceOpen(sessionId, response);
    return response;
  }

  /**
   * Syncs the coach's live drawings into the clip that was already
   * auto-saved + shared with the session's students when analysis
   * completed (see ReferenceService.completeProcessing) — there's no
   * manual "save" step, this just carries forward whatever gets drawn.
   */
  @Post(':refId/sync-annotations')
  async syncAnnotations(
    @Param('id') sessionId: string,
    @Param('refId') refId: string,
    @CurrentUser() user: JwtPayload,
    @Body() dto: SyncReferenceAnnotationsDto,
  ) {
    return this.referenceService.syncAnnotations(sessionId, refId, user.sub, user.role, dto.strokesByFrame);
  }

  // ── Tracked (joint-attached) annotations — the new coaching feature ──────

  /** List joint-attached annotations for a video (coach + shared students). */
  @Get(':refId/annotations')
  async listAnnotations(@Param('id') sessionId: string, @Param('refId') refId: string) {
    return this.referenceService.listAnnotations(sessionId, refId);
  }

  /** Coach creates a joint-attached annotation; broadcast to the room. */
  @Post(':refId/annotations')
  async createAnnotation(
    @Param('id') sessionId: string,
    @Param('refId') refId: string,
    @CurrentUser() user: JwtPayload,
    @Body() dto: CreateTrackedAnnotationDto,
  ) {
    const ann = await this.referenceService.createAnnotation(sessionId, refId, user.sub, user.role, dto);
    this.realtimeGateway.emitReferenceAnnotationCreate(sessionId, refId, ann);
    return ann;
  }

  @Patch(':refId/annotations/:annId')
  async updateAnnotation(
    @Param('id') sessionId: string,
    @Param('refId') refId: string,
    @Param('annId') annId: string,
    @CurrentUser() user: JwtPayload,
    @Body() dto: UpdateTrackedAnnotationDto,
  ) {
    const ann = await this.referenceService.updateAnnotation(sessionId, refId, annId, user.sub, user.role, dto);
    this.realtimeGateway.emitReferenceAnnotationUpdate(sessionId, refId, ann);
    return ann;
  }

  @Delete(':refId/annotations/:annId')
  async deleteAnnotation(
    @Param('id') sessionId: string,
    @Param('refId') refId: string,
    @Param('annId') annId: string,
    @CurrentUser() user: JwtPayload,
  ) {
    const res = await this.referenceService.deleteAnnotation(sessionId, refId, annId, user.sub, user.role);
    this.realtimeGateway.emitReferenceAnnotationDelete(sessionId, refId, annId);
    return res;
  }

  /** Coach exports the video: either the full skeleton overlay burned in, or
   * just the joint-attached annotations over the raw footage. */
  @Post(':refId/export')
  async export(
    @Param('id') sessionId: string,
    @Param('refId') refId: string,
    @CurrentUser() user: JwtPayload,
    @Body() body: ExportReferenceVideoDto,
  ) {
    return this.referenceService.startExport(sessionId, refId, user.sub, user.role, body);
  }
}

/**
 * Separate, unauthenticated-by-JWT surface: the pose-service completion
 * callback (verified by a per-video HMAC token) and signed media streaming
 * (verified by an HMAC signature — <video> tags and the pose-service can't
 * send an Authorization header, so this mirrors the CloudFront signed-URL
 * pattern already used for clips/recordings). @Public() at class level since
 * every endpoint here self-verifies via one of those two mechanisms instead
 * of a bearer token.
 */
@Public()
@Controller('reference')
export class ReferenceMediaController {
  constructor(
    private readonly referenceService: ReferenceService,
    private readonly storage: ReferenceStorageService,
    private readonly realtimeGateway: RealtimeGateway,
  ) {}

  @Post(':refId/complete')
  async complete(
    @Param('refId') refId: string,
    @Headers('x-callback-token') token: string | undefined,
    @Body()
    body: {
      status: 'ready' | 'failed';
      reason?: string;
      keypoints?: unknown;
      fps?: number;
      frameCount?: number;
      width?: number;
      height?: number;
      durationMs?: number;
      keypointFormat?: 'coco17' | 'halpe26';
    },
  ) {
    if (!token || !this.referenceService.verifyCallbackToken(refId, token)) {
      throw new UnauthorizedException('Invalid callback token');
    }

    if (body.status === 'failed') {
      await this.referenceService.markFailed(refId, body.reason ?? 'pose-service processing failed');
      return { success: true };
    }

    const video = await this.referenceService.completeProcessing(refId, body.keypoints ?? { frames: [] }, {
      fps: body.fps ?? 0,
      frameCount: body.frameCount ?? 0,
      width: body.width ?? 0,
      height: body.height ?? 0,
      durationMs: body.durationMs ?? 0,
      keypointFormat: body.keypointFormat ?? 'coco17',
    });

    const response = await this.referenceService.toResponse(video);
    this.realtimeGateway.emitReferenceReady(video.sessionId, response);
    return { success: true };
  }

  /**
   * Pose-service uploads the skeleton-burned-in video here, before posting
   * /complete — see reference_processor.py. Same callback-token auth as
   * /complete, since this is also pose-service-only, never client-facing.
   */
  @Post(':refId/overlay')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_UPLOAD_BYTES } }))
  async overlay(
    @Param('refId') refId: string,
    @Headers('x-callback-token') token: string | undefined,
    @UploadedFile() file: Express.Multer.File | undefined,
  ) {
    if (!token || !this.referenceService.verifyCallbackToken(refId, token)) {
      throw new UnauthorizedException('Invalid callback token');
    }
    if (!file) {
      throw new BadRequestException('Missing overlay video file');
    }
    await this.referenceService.saveOverlayVideo(refId, file.buffer);
    return { success: true };
  }

  /** Pose-service uploads the rendered export (video + skeleton + tracked
   * annotations) here after /reference/export. Callback-token auth. */
  @Post(':refId/export-upload')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: MAX_UPLOAD_BYTES } }))
  async exportUpload(
    @Param('refId') refId: string,
    @Headers('x-callback-token') token: string | undefined,
    @UploadedFile() file: Express.Multer.File | undefined,
  ) {
    if (!token || !this.referenceService.verifyCallbackToken(refId, token)) {
      throw new UnauthorizedException('Invalid callback token');
    }
    if (!file) {
      throw new BadRequestException('Missing export video file');
    }
    await this.referenceService.saveExportVideo(refId, file.buffer);
    this.realtimeGateway.emitReferenceExportReady(refId);
    return { success: true };
  }

  /** Pose-service posts here if /reference/export throws — previously the
   * export job had no failure-reporting path at all (only success, via
   * export-upload above), leaving the coach's UI stuck showing "Exporting…"
   * forever with no error and no way to retry. Callback-token auth, same
   * pattern as the other pose-service callbacks in this controller. */
  @Post(':refId/export-failed')
  async exportFailed(
    @Param('refId') refId: string,
    @Headers('x-callback-token') token: string | undefined,
    @Body() body: { reason?: string },
  ) {
    if (!token || !this.referenceService.verifyCallbackToken(refId, token)) {
      throw new UnauthorizedException('Invalid callback token');
    }
    const reason = body.reason || 'Export failed';
    await this.referenceService.markExportFailed(refId, reason);
    this.realtimeGateway.emitReferenceExportFailed(refId, reason);
    return { success: true };
  }

  @Get('media/*')
  async streamMedia(
    @Req() req: Request,
    @Res() res: Response,
    @Query('exp') exp: string,
    @Query('sig') sig: string,
  ): Promise<void> {
    const key = this.extractKey(req);
    if (!exp || !sig || !this.storage.verifySignature(key, parseInt(exp, 10), sig)) {
      throw new UnauthorizedException('Invalid or expired media signature');
    }
    await this.pipeFile(key, req, res);
  }

  @Head('media/*')
  async headMedia(
    @Req() req: Request,
    @Res() res: Response,
    @Query('exp') exp: string,
    @Query('sig') sig: string,
  ): Promise<void> {
    const key = this.extractKey(req);
    if (!exp || !sig || !this.storage.verifySignature(key, parseInt(exp, 10), sig)) {
      throw new UnauthorizedException('Invalid or expired media signature');
    }
    const stat = await this.storage.stat(key);
    if (!stat) throw new NotFoundException('Media not found');
    res.setHeader('Content-Length', stat.size.toString());
    res.setHeader('Accept-Ranges', 'bytes');
    res.status(200).end();
  }

  private extractKey(req: Request): string {
    // Everything after '/api/v1/reference/media/'
    const marker = '/reference/media/';
    const idx = req.path.indexOf(marker);
    const key = decodeURIComponent(req.path.slice(idx + marker.length));
    if (!key) throw new BadRequestException('Missing media key');
    return key;
  }

  private contentTypeFor(key: string): string {
    if (key.endsWith('.json')) return 'application/json';
    if (key.endsWith('.webm')) return 'video/webm';
    if (key.endsWith('.mov')) return 'video/quicktime';
    if (key.endsWith('.mkv')) return 'video/x-matroska';
    return 'video/mp4';
  }

  private async pipeFile(key: string, req: Request, res: Response): Promise<void> {
    const stat = await this.storage.stat(key);
    if (!stat) throw new NotFoundException('Media not found');

    const contentType = this.contentTypeFor(key);
    const range = req.headers.range;

    if (!range) {
      res.setHeader('Content-Type', contentType);
      res.setHeader('Content-Length', stat.size.toString());
      res.setHeader('Accept-Ranges', 'bytes');
      this.storage.createReadStreamForKey(key).pipe(res);
      return;
    }

    // Range: bytes=<start>-<end>
    const match = /bytes=(\d*)-(\d*)/.exec(range);
    const start = match?.[1] ? parseInt(match[1], 10) : 0;
    const end = match?.[2] ? parseInt(match[2], 10) : stat.size - 1;
    const chunkSize = end - start + 1;

    res.writeHead(206, {
      'Content-Range': `bytes ${start}-${end}/${stat.size}`,
      'Accept-Ranges': 'bytes',
      'Content-Length': chunkSize,
      'Content-Type': contentType,
    });
    this.storage.createReadStreamForKey(key, { start, end }).pipe(res);
  }
}
