import {
  BadRequestException,
  Body,
  Controller,
  Get,
  Head,
  Headers,
  NotFoundException,
  Param,
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
import type { Request, Response } from 'express';

import { CurrentUser } from '../common/decorators/current-user.decorator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../common/guards/roles.guard';
import { SessionsGuard } from '../sessions/sessions.guard';
import { RealtimeGateway } from '../realtime/realtime.gateway';
import type { JwtPayload } from '@replaycoach/types';

import { ReferenceService } from './reference.service';
import { ReferenceStorageService } from './reference-storage.service';
import { SaveReferenceClipDto, UploadReferenceVideoDto } from './reference.dto';

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

  /** Coach saves the clip + their drawings, shared with the given students. */
  @Post(':refId/save-clip')
  async saveClip(
    @Param('id') sessionId: string,
    @Param('refId') refId: string,
    @CurrentUser() user: JwtPayload,
    @Body() dto: SaveReferenceClipDto,
  ) {
    return this.referenceService.saveAsClip(sessionId, refId, user.sub, user.role, dto);
  }
}

/**
 * Separate, unauthenticated-by-JWT surface: the pose-service completion
 * callback (verified by a per-video HMAC token) and signed media streaming
 * (verified by an HMAC signature — <video> tags and the pose-service can't
 * send an Authorization header, so this mirrors the CloudFront signed-URL
 * pattern already used for clips/recordings).
 */
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
    });

    const response = await this.referenceService.toResponse(video);
    this.realtimeGateway.emitReferenceReady(video.sessionId, response);
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
