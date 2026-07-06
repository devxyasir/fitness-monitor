import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { NotFoundException, ForbiddenException, UnprocessableEntityException } from '@nestjs/common';

import { ClipsService } from './clips.service';
import { Session } from '../sessions/session.entity';
import {
  Clip,
  ClipShare,
  Annotation,
  Recording,
} from '../database/entities/others.entities';
import { CloudFrontSigner } from '../media/cloudfront-signer';
import { ReferenceStorageService } from '../reference/reference-storage.service';

describe('ClipsService', () => {
  let service: ClipsService;
  let sessionRepo: Repository<Session>;
  let recordingRepo: Repository<Recording>;
  let clipRepo: Repository<Clip>;
  let clipShareRepo: Repository<ClipShare>;
  let annotationRepo: Repository<Annotation>;
  let cloudFrontSigner: CloudFrontSigner;

  const mockSessionRepo = {
    findOne: jest.fn(),
  };

  const mockRecordingRepo = {
    findOne: jest.fn(),
  };

  const mockClipRepo = {
    save: jest.fn().mockImplementation((clip) => Promise.resolve(clip)),
    findOne: jest.fn(),
    find: jest.fn(),
  };

  const mockClipShareRepo = {
    save: jest.fn(),
    findOne: jest.fn(),
    find: jest.fn(),
  };

  const mockAnnotationRepo = {
    find: jest.fn(),
    save: jest.fn(),
  };

  const mockCloudFrontSigner = {
    signUrl: jest.fn().mockImplementation((key) => `https://cdn.example.com/${key}?signed=true`),
  };

  const mockReferenceStorage = {
    getPlaybackUrl: jest.fn().mockImplementation((key) => Promise.resolve(`https://local.example.com/${key}?sig=abc`)),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ClipsService,
        {
          provide: getRepositoryToken(Session),
          useValue: mockSessionRepo,
        },
        {
          provide: getRepositoryToken(Recording),
          useValue: mockRecordingRepo,
        },
        {
          provide: getRepositoryToken(Clip),
          useValue: mockClipRepo,
        },
        {
          provide: getRepositoryToken(ClipShare),
          useValue: mockClipShareRepo,
        },
        {
          provide: getRepositoryToken(Annotation),
          useValue: mockAnnotationRepo,
        },
        {
          provide: CloudFrontSigner,
          useValue: mockCloudFrontSigner,
        },
        {
          provide: ReferenceStorageService,
          useValue: mockReferenceStorage,
        },
      ],
    }).compile();

    service = module.get<ClipsService>(ClipsService);
    sessionRepo = module.get<Repository<Session>>(getRepositoryToken(Session));
    recordingRepo = module.get<Repository<Recording>>(getRepositoryToken(Recording));
    clipRepo = module.get<Repository<Clip>>(getRepositoryToken(Clip));
    clipShareRepo = module.get<Repository<ClipShare>>(getRepositoryToken(ClipShare));
    annotationRepo = module.get<Repository<Annotation>>(getRepositoryToken(Annotation));
    cloudFrontSigner = module.get<CloudFrontSigner>(CloudFrontSigner);

    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('createClip', () => {
    const sessionId = 'session-123';
    const coachId = 'coach-123';

    it('should throw NotFoundException if session does not exist', async () => {
      mockSessionRepo.findOne.mockResolvedValue(null);

      await expect(
        service.createClip(sessionId, coachId, {
          title: 'My Clip',
          startMs: 1000,
          endMs: 5000,
        }),
      ).rejects.toThrow(NotFoundException);
    });

    it('should throw ForbiddenException if requester is not the coach', async () => {
      const mockSession = { id: sessionId, coachId: 'other-coach' } as Session;
      mockSessionRepo.findOne.mockResolvedValue(mockSession);

      await expect(
        service.createClip(sessionId, coachId, {
          title: 'My Clip',
          startMs: 1000,
          endMs: 5000,
        }),
      ).rejects.toThrow(ForbiddenException);
    });

    it('should throw UnprocessableEntityException if startMs is not less than endMs', async () => {
      const mockSession = { id: sessionId, coachId } as Session;
      mockSessionRepo.findOne.mockResolvedValue(mockSession);

      await expect(
        service.createClip(sessionId, coachId, {
          title: 'My Clip',
          startMs: 5000,
          endMs: 1000,
        }),
      ).rejects.toThrow(UnprocessableEntityException);
    });

    it('should successfully save clip, duplicate inside-range session annotations, and build shares list', async () => {
      const mockSession = { id: sessionId, coachId } as Session;
      mockSessionRepo.findOne.mockResolvedValue(mockSession);

      const mockAnnotations = [
        { id: 'ann-1', frameTimestampMs: 500, type: 'arrow', geometry: {} },
        { id: 'ann-2', frameTimestampMs: 2000, type: 'circle', geometry: {} },
        { id: 'ann-3', frameTimestampMs: 4000, type: 'text', geometry: {} },
        { id: 'ann-4', frameTimestampMs: 6000, type: 'ellipse', geometry: {} },
      ] as Annotation[];

      mockAnnotationRepo.find.mockResolvedValue(mockAnnotations);

      const result = await service.createClip(sessionId, coachId, {
        title: 'Cloned Range Clip',
        startMs: 1000,
        endMs: 5000,
        studentIds: ['stud-1', 'stud-2'],
      });

      expect(clipRepo.save).toHaveBeenCalled();
      expect(result.title).toEqual('Cloned Range Clip');
      expect(result.sessionId).toEqual(sessionId);
      expect(result.createdBy).toEqual(coachId);

      // Duplication of annotations between 1s (1000ms) and 5s (5000ms) (i.e. 'ann-2' and 'ann-3')
      expect(annotationRepo.save).toHaveBeenCalled();
      const savedAnns: Annotation[] = mockAnnotationRepo.save.mock.calls[0][0];
      expect(savedAnns).toHaveLength(2);
      expect(savedAnns[0]!.frameTimestampMs).toBe(2000);
      expect(savedAnns[1]!.frameTimestampMs).toBe(4000);
      expect(savedAnns[0]!.clipId).toBe(result.id);
      expect(savedAnns[1]!.clipId).toBe(result.id);

      // Verify shares are stored
      expect(clipShareRepo.save).toHaveBeenCalled();
      const savedShares: ClipShare[] = mockClipShareRepo.save.mock.calls[0][0];
      expect(savedShares).toHaveLength(2);
      expect(savedShares[0]!.clipId).toBe(result.id);
      expect(savedShares[0]!.sharedWithUserId).toBe('stud-1');
      expect(savedShares[1]!.sharedWithUserId).toBe('stud-2');
    });
  });

  describe('getClip (IDOR check)', () => {
    const clipId = 'clip-555';
    const coachId = 'coach-123';

    it('should successfully return the clip, playUrl, and annotations for the coach creator', async () => {
      const mockClip = { id: clipId, createdBy: coachId, s3Key: 'key/index.m3u8' } as Clip;
      mockClipRepo.findOne.mockResolvedValue(mockClip);

      const mockAnns = [{ id: 'ann-1', frameTimestampMs: 300 }] as Annotation[];
      mockAnnotationRepo.find.mockResolvedValue(mockAnns);

      const result = await service.getClip(clipId, coachId, 'coach');

      expect(result.clip.id).toBe(clipId);
      expect(result.playUrl).toContain('signed=true');
      expect(result.annotations).toEqual(mockAnns);
    });

    it('should sign playback via ReferenceStorageService for a reference-sourced clip', async () => {
      const mockClip = {
        id: clipId,
        createdBy: coachId,
        s3Key: 'sessions/s1/reference/r1/original.webm',
        clipType: 'reference' as const,
      } as Clip;
      mockClipRepo.findOne.mockResolvedValue(mockClip);
      mockAnnotationRepo.find.mockResolvedValue([]);

      const result = await service.getClip(clipId, coachId, 'coach');

      expect(mockReferenceStorage.getPlaybackUrl).toHaveBeenCalledWith(mockClip.s3Key);
      expect(mockCloudFrontSigner.signUrl).not.toHaveBeenCalled();
      expect(result.playUrl).toContain('sig=abc');
    });

    it('should allow shared student to retrieve clip', async () => {
      const mockClip = { id: clipId, createdBy: coachId, s3Key: 'key/index.m3u8' } as Clip;
      mockClipRepo.findOne.mockResolvedValue(mockClip);

      mockClipShareRepo.findOne.mockResolvedValue({ id: 'share-1' } as ClipShare);

      const result = await service.getClip(clipId, 'student-123', 'student');
      expect(result.clip.id).toBe(clipId);
    });

    it('should throw ForbiddenException for student who is not shared', async () => {
      const mockClip = { id: clipId, createdBy: coachId, s3Key: 'key/index.m3u8' } as Clip;
      mockClipRepo.findOne.mockResolvedValue(mockClip);

      mockClipShareRepo.findOne.mockResolvedValue(null);

      await expect(
        service.getClip(clipId, 'student-not-shared', 'student'),
      ).rejects.toThrow(ForbiddenException);
    });
  });
});
