import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';

import { AnnotationsService } from './annotations.service';
import { Annotation, ReplayEvent, Clip } from '../database/entities/others.entities';

describe('AnnotationsService', () => {
  let service: AnnotationsService;
  let annotationRepository: Repository<Annotation>;
  let replayEventRepository: Repository<ReplayEvent>;
  let clipRepository: Repository<Clip>;

  const mockAnnotationRepository = {
    save: jest.fn().mockImplementation((ann) => Promise.resolve({ ...ann, id: 'anno-123' })),
    findOne: jest.fn(),
    remove: jest.fn().mockResolvedValue(undefined),
    find: jest.fn(),
  };

  const mockReplayEventRepository = {
    findOne: jest.fn(),
  };

  const mockClipRepository = {
    findOne: jest.fn(),
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        AnnotationsService,
        {
          provide: getRepositoryToken(Annotation),
          useValue: mockAnnotationRepository,
        },
        {
          provide: getRepositoryToken(ReplayEvent),
          useValue: mockReplayEventRepository,
        },
        {
          provide: getRepositoryToken(Clip),
          useValue: mockClipRepository,
        },
      ],
    }).compile();

    service = module.get<AnnotationsService>(AnnotationsService);
    annotationRepository = module.get<Repository<Annotation>>(getRepositoryToken(Annotation));
    replayEventRepository = module.get<Repository<ReplayEvent>>(getRepositoryToken(ReplayEvent));
    clipRepository = module.get<Repository<Clip>>(getRepositoryToken(Clip));

    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('saveAnnotation', () => {
    it('should clamp geometry coordinate bounds to [0, 1] and sanitize HTML text content', async () => {
      const mockReplayEvent = { id: 'event-uuid', sessionId: 'sess-uuid' } as ReplayEvent;
      mockReplayEventRepository.findOne.mockResolvedValue(mockReplayEvent);

      const payload = {
        sessionId: 'sess-uuid',
        frameTimestampMs: 12000,
        type: 'arrow',
        geometry: {
          from: [1.5, -0.2],
          to: [0.5, 0.95],
        },
        textContent: 'Hello <b>arrow</b>',
      };

      const result = await service.saveAnnotation(payload, 'coach-uuid');

      expect(replayEventRepository.findOne).toHaveBeenCalledWith({
        where: { sessionId: 'sess-uuid' },
        order: { createdAt: 'DESC' },
      });

      expect(annotationRepository.save).toHaveBeenCalled();
      const savedArg = mockAnnotationRepository.save.mock.calls[0][0];

      // Geometry coordinates are clamped
      expect(savedArg.geometry).toEqual({
        from: [1, 0],
        to: [0.5, 0.95],
      });

      // Text values are sanitized
      expect(savedArg.textContent).toEqual('Hello arrow');
      expect(savedArg.createdBy).toEqual('coach-uuid');
      expect(savedArg.replayEventId).toEqual('event-uuid');
      expect(result.id).toEqual('anno-123');
    });

    it('should throw NotFoundException if no replay flow tracking exists for the session', async () => {
      mockReplayEventRepository.findOne.mockResolvedValue(null);

      const payload = {
        sessionId: 'sess-uuid',
        frameTimestampMs: 12000,
        type: 'circle',
        geometry: { cx: 0.5, cy: 0.5, r: 0.2 },
      };

      await expect(service.saveAnnotation(payload, 'coach-uuid')).rejects.toThrow();
    });
  });

  describe('undoLastAnnotation', () => {
    it('should locate and call remove on the latest annotation of matching frame timestamp', async () => {
      const mockAnnotation = {
        id: 'anno-321',
        createdBy: 'coach-uuid',
        frameTimestampMs: 25000,
      } as Annotation;

      mockAnnotationRepository.findOne.mockResolvedValue(mockAnnotation);

      await service.undoLastAnnotation('sess-uuid', 'coach-uuid', 25000);

      expect(annotationRepository.findOne).toHaveBeenCalled();
      expect(annotationRepository.remove).toHaveBeenCalledWith(mockAnnotation);
    });

    it('should log a warn message but not throw or crash if no undo target exists', async () => {
      mockAnnotationRepository.findOne.mockResolvedValue(null);

      await expect(service.undoLastAnnotation('sess-uuid', 'coach-uuid', 25000)).resolves.not.toThrow();
      expect(annotationRepository.remove).not.toHaveBeenCalled();
    });
  });

  describe('clearAnnotations', () => {
    it('should save a tombstone annotation at the target frame timestamp', async () => {
      const mockReplayEvent = { id: 'event-uuid', sessionId: 'sess-uuid' } as ReplayEvent;
      mockReplayEventRepository.findOne.mockResolvedValue(mockReplayEvent);

      await service.clearAnnotations('sess-uuid', 'coach-uuid', 18000);

      expect(annotationRepository.save).toHaveBeenCalled();
      const savedArg = mockAnnotationRepository.save.mock.calls[0][0];

      expect(savedArg.type).toEqual('tombstone');
      expect(savedArg.frameTimestampMs).toEqual(18000);
      expect(savedArg.replayEventId).toEqual('event-uuid');
      expect(savedArg.geometry).toEqual({});
      expect(savedArg.textContent).toBeNull();
    });
  });
});
