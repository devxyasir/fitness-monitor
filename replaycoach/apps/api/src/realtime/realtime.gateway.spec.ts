import { Test } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { JwtService } from '@nestjs/jwt';

import { RealtimeGateway } from './realtime.gateway';
import { Session } from '../sessions/session.entity';
import { SessionParticipant } from '../sessions/session-participant.entity';
import { AnnotationsService } from '../annotations/annotations.service';

describe('RealtimeGateway', () => {
  let gateway: RealtimeGateway;
  let jwtService: jest.Mocked<JwtService>;
  let sessionRepo: jest.Mocked<Repository<Session>>;
  let participantRepo: jest.Mocked<Repository<SessionParticipant>>;

  const mockJwtService = {
    verify: jest.fn(),
  };

  const mockSessionRepo = {
    findOne: jest.fn(),
  };

  const mockParticipantRepo = {
    findOne: jest.fn(),
  };

  const mockAnnotationsService = {
    saveAnnotation: jest.fn().mockResolvedValue({}),
    undoLastAnnotation: jest.fn().mockResolvedValue(undefined),
    clearAnnotations: jest.fn().mockResolvedValue({}),
  };

  beforeEach(async () => {
    jest.clearAllMocks();

    const module = await Test.createTestingModule({
      providers: [
        RealtimeGateway,
        {
          provide: JwtService,
          useValue: mockJwtService,
        },
        {
          provide: getRepositoryToken(Session),
          useValue: mockSessionRepo,
        },
        {
          provide: getRepositoryToken(SessionParticipant),
          useValue: mockParticipantRepo,
        },
        {
          provide: AnnotationsService,
          useValue: mockAnnotationsService,
        },
      ],
    }).compile();

    gateway = module.get<RealtimeGateway>(RealtimeGateway);
    jwtService = module.get(JwtService);
    sessionRepo = module.get(getRepositoryToken(Session));
    participantRepo = module.get(getRepositoryToken(SessionParticipant));

    // Mock socket io server instance
    gateway.server = {
      to: jest.fn().mockReturnThis(),
      emit: jest.fn(),
    } as any;
  });

  it('should compile and construct', () => {
    expect(gateway).toBeDefined();
  });

  describe('handleConnection', () => {
    it('should disconnect socket if token is missing', async () => {
      const mockSocket = {
        handshake: {
          auth: {},
          query: {},
        },
        disconnect: jest.fn(),
      } as any;

      await gateway.handleConnection(mockSocket);

      expect(mockSocket.disconnect).toHaveBeenCalled();
    });

    it('should disconnect socket if JWT verification fails', async () => {
      const mockSocket = {
        handshake: {
          auth: { token: 'invalid-token' },
        },
        disconnect: jest.fn(),
      } as any;

      mockJwtService.verify.mockImplementation(() => {
        throw new Error('Invalid token');
      });

      await gateway.handleConnection(mockSocket);

      expect(mockSocket.disconnect).toHaveBeenCalled();
    });

    it('should save user payload to socket.data if validation succeeds', async () => {
      const mockPayload = { sub: 'user-1', email: 'user@example.com', role: 'student' };
      const mockSocket = {
        handshake: {
          auth: { token: 'valid-token' },
        },
        data: {},
        disconnect: jest.fn(),
      } as any;

      mockJwtService.verify.mockReturnValue(mockPayload);

      await gateway.handleConnection(mockSocket);

      expect(mockSocket.data.user).toEqual(mockPayload);
      expect(mockSocket.disconnect).not.toHaveBeenCalled();
    });
  });

  describe('handleJoin', () => {
    it('should return error if payload user is missing', async () => {
      const mockSocket = { data: {} } as any;
      const res = await gateway.handleJoin({ sessionId: 'session-1' }, mockSocket);
      expect(res).toEqual({ status: 'error', message: 'Unauthorized' });
    });

    it('should return error if session is missing in DB', async () => {
      const mockSocket = {
        data: { user: { sub: 'student-1', role: 'student' } },
        join: jest.fn(),
      } as any;

      mockSessionRepo.findOne.mockResolvedValue(null);

      const res = await gateway.handleJoin({ sessionId: 'session-1' }, mockSocket);
      expect(res).toEqual({ status: 'error', message: 'Session not found' });
    });

    it('should allow coach to join session and join coach and targeted rooms', async () => {
      const mockSocket = {
        data: { user: { sub: 'coach-1', role: 'coach', email: 'coach@example.com' } },
        join: jest.fn(),
      } as any;

      mockSessionRepo.findOne.mockResolvedValue({
        id: 'session-1',
        coachId: 'coach-1',
      });
      mockParticipantRepo.findOne.mockResolvedValue(null);

      const res = await gateway.handleJoin({ sessionId: 'session-1' }, mockSocket);

      expect(res).toEqual({ status: 'ok' });
      expect(mockSocket.join).toHaveBeenCalledWith('session:session-1');
      expect(mockSocket.join).toHaveBeenCalledWith('session:session-1:coach');
      expect(mockSocket.join).toHaveBeenCalledWith('session:session-1:participant:coach-1');
    });

    it('should allow signed participant student to join and not add them to coach room', async () => {
      const mockSocket = {
        data: { user: { sub: 'student-1', role: 'student', email: 'student@example.com' } },
        join: jest.fn(),
      } as any;

      mockSessionRepo.findOne.mockResolvedValue({
        id: 'session-1',
        coachId: 'coach-1',
      });
      mockParticipantRepo.findOne.mockResolvedValue({
        id: 'assoc-1',
        sessionId: 'session-1',
        userId: 'student-1',
        status: 'approved',
      });

      const res = await gateway.handleJoin({ sessionId: 'session-1' }, mockSocket);

      expect(res).toEqual({ status: 'ok' });
      expect(mockSocket.join).toHaveBeenCalledWith('session:session-1');
      expect(mockSocket.join).not.toHaveBeenCalledWith('session:session-1:coach');
      expect(mockSocket.join).toHaveBeenCalledWith('session:session-1:participant:student-1');
    });

    it('should block non-related student client with Forbidden', async () => {
      const mockSocket = {
        data: { user: { sub: 'student-99', role: 'student', email: 'intruder@example.com' } },
        join: jest.fn(),
      } as any;

      mockSessionRepo.findOne.mockResolvedValue({
        id: 'session-1',
        coachId: 'coach-1',
      });
      mockParticipantRepo.findOne.mockResolvedValue(null); // not listed as participant

      const res = await gateway.handleJoin({ sessionId: 'session-1' }, mockSocket);

      expect(res).toEqual({ status: 'error', message: 'Forbidden' });
      expect(mockSocket.join).not.toHaveBeenCalled();
    });
  });

  describe('handleAnnotationDraw', () => {
    it('should reject non-coach user draw attempts', async () => {
      const mockSocket = {
        data: {
          user: { sub: 'student-1', role: 'student', email: 'student@example.com' },
          annotationRateInfo: { count: 0, windowStart: Date.now() },
        },
      } as any;

      mockSessionRepo.findOne.mockResolvedValue({
        id: 'session-1',
        coachId: 'coach-1', // coach is coach-1
      });

      const res = await gateway.handleAnnotationDraw(
        { sessionId: 'session-1', payload: { stroke: 'dummy' } },
        mockSocket,
      );

      expect(res).toEqual({ status: 'error', message: 'Forbidden' });
    });

    it('should broadcast and complete draw if caller is session coach', async () => {
      const mockSocket = {
        data: {
          user: { sub: 'coach-1', role: 'coach', email: 'coach@example.com' },
        },
      } as any;

      mockSessionRepo.findOne.mockResolvedValue({
        id: 'session-1',
        coachId: 'coach-1', // coach is coach-1
      });

      const res = await gateway.handleAnnotationDraw(
        { sessionId: 'session-1', payload: { stroke: 'draw-action' } },
        mockSocket,
      );

      expect(res).toEqual({ status: 'ok' });
      expect(gateway.server.to).toHaveBeenCalledWith('session:session-1');
      expect(gateway.server.emit).toHaveBeenCalledWith('annotation:draw', { stroke: 'draw-action' });
    });

    it('should partition emissions if studentIds targets listed', async () => {
      const mockSocket = {
        data: {
          user: { sub: 'coach-1', role: 'coach', email: 'coach@example.com' },
        },
      } as any;

      mockSessionRepo.findOne.mockResolvedValue({
        id: 'session-1',
        coachId: 'coach-1',
      });

      const res = await gateway.handleAnnotationDraw(
        { sessionId: 'session-1', payload: 'draw-2', studentIds: ['student-1'] },
        mockSocket,
      );

      expect(res).toEqual({ status: 'ok' });
      expect(gateway.server.to).toHaveBeenCalledWith('session:session-1:participant:student-1');
      expect(gateway.server.emit).toHaveBeenCalledWith('annotation:draw', 'draw-2');
    });

    it('should drop messages if rate limits are exceeded (>30 messages per connection)', async () => {
      const mockSocket = {
        data: {
          user: { sub: 'coach-1', role: 'coach', email: 'coach@example.com' },
          annotationRateInfo: { count: 30, windowStart: Date.now() }, // already hit 30 in current window
        },
      } as any;

      mockSessionRepo.findOne.mockResolvedValue({
        id: 'session-1',
        coachId: 'coach-1',
      });

      const res = await gateway.handleAnnotationDraw(
        { sessionId: 'session-1', payload: 'flood' },
        mockSocket,
      );

      expect(res).toEqual({ status: 'error', message: 'Rate limit exceeded' });
      expect(gateway.server.to).not.toHaveBeenCalled();
    });
  });

  describe('Replay Functions', () => {
    it('emitBufferReplay should fanout to room with buffer payload', () => {
      gateway.emitBufferReplay('session-1', 'student-1', -30000, 0);
      expect(gateway.server.to).toHaveBeenCalledWith('session:session-1');
      expect(gateway.server.emit).toHaveBeenCalledWith('session:replay:start', {
        participantId: 'student-1',
        fromOffsetMs: -30000,
        toOffsetMs: 0,
      });
    });

    it('emitReplaySeek should fanout to rooms', () => {
      gateway.emitReplaySeek('session-1', ['student-1'], { timestampMs: 300 });
      expect(gateway.server.to).toHaveBeenCalledWith('session:session-1:participant:student-1');
      expect(gateway.server.emit).toHaveBeenCalledWith('replay:seek', { timestampMs: 300 });
    });

    it('emitBufferReplayEnd should fanout to room', () => {
      gateway.emitBufferReplayEnd('session-1');
      expect(gateway.server.to).toHaveBeenCalledWith('session:session-1');
      expect(gateway.server.emit).toHaveBeenCalledWith('session:replay:end', {});
    });
  });

  describe('Multi-Gateway Scaling Pub/Sub Simulation', () => {
    it('should propagate events between distinct gateway instances via pub/sub mock channel broker', async () => {
      const pubSubBroker = {
        subscribers: new Map<string, Array<(channel: string, msg: string) => void>>(),
        subscribe(channel: string, callback: (channel: string, msg: string) => void) {
          let list = this.subscribers.get(channel);
          if (!list) {
            list = [];
            this.subscribers.set(channel, list);
          }
          list.push(callback);
        },
        publish(channel: string, message: string) {
          const list = this.subscribers.get(channel);
          if (list) {
            for (const cb of list) {
              cb(channel, message);
            }
          }
        },
      };

      const gatewayA = new RealtimeGateway(null as any, null as any, null as any, null as any);
      const gatewayB = new RealtimeGateway(null as any, null as any, null as any, null as any);

      const mockSocketClientOnB = {
        id: 'student-socket-on-gateway-B',
        receivedEvents: [] as any[],
      };

      const createMockServer = (gatewayId: string, client?: any) => {
        return {
          to: (room: string) => {
            return {
              emit: (event: string, payload: any) => {
                const redisChannel = `socket.io#${room}`;
                pubSubBroker.publish(
                  redisChannel,
                  JSON.stringify({ event, payload, senderGateway: gatewayId }),
                );
              },
            };
          },
          onRedisMessage: (channel: string, messageStr: string) => {
            const { event, payload } = JSON.parse(messageStr);
            if (client) {
              client.receivedEvents.push({ event, payload });
            }
          },
        };
      };

      gatewayA.server = createMockServer('gateway-A') as any;
      gatewayB.server = createMockServer('gateway-B', mockSocketClientOnB) as any;

      pubSubBroker.subscribe('socket.io#session:session-1', (channel, msg) => {
        gatewayB.server.to = jest.fn().mockReturnThis(); // stub
        (gatewayB.server as any).onRedisMessage(channel, msg);
      });

      gatewayA.emitBufferReplay('session-1', 'student-1', -15000, 0);

      expect(mockSocketClientOnB.receivedEvents).toHaveLength(1);
      expect(mockSocketClientOnB.receivedEvents[0]).toEqual({
        event: 'session:replay:start',
        payload: { participantId: 'student-1', fromOffsetMs: -15000, toOffsetMs: 0 },
      });
    });
  });
});
